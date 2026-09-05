import { getContext, extension_settings } from '/scripts/extensions.js';
import { saveSettingsDebounced, eventSource, event_types } from '/script.js';

const extName = "Auto-Persona-Switch-NFL";
if (!extension_settings[extName]) extension_settings[extName] = {};
const settings = extension_settings[extName];

// 自动清理之前遗留的 [object Object] 垃圾数据
const getName = (data) => typeof data === 'object' && data !== null ? (data.name || "") : (data || "");

const getGreetIdx = () => {
    const ctx = getContext();
    if (!ctx?.chat?.length || ctx.characterId === undefined) return -1;
    const char = ctx.characters[ctx.characterId];
    if (!char) return -1;
    const norm = t => (t||'').replace(/\{\{.*?\}\}/g, '').replace(/<[^>]*>?/gm, '').replace(/[^\w\u4e00-\u9fa5]/g, '').substring(0, 15);
    const cur = norm(ctx.chat[0].mes);
    return [char.first_mes, ...(char.data?.alternate_greetings || [])].findIndex(g => norm(g) === cur);
};

// 统一刷新 UI，保持横栏和底栏同步
const updateUI = () => {
    const ctx = getContext();
    const charId = ctx?.characterId;
    const sideContainer = $("#aps-mapping-container");
    const botPanel = $("#aps-injected-panel");

    if (sideContainer.length) {
        sideContainer.empty();
        if (charId === undefined) {
            sideContainer.append("<p style='opacity:0.6;'>请选中角色卡。</p>");
        } else {
            if (!settings[charId]) settings[charId] = {};
            const char = ctx.characters[charId];
            const greets = [char.first_mes, ...(char.data?.alternate_greetings || [])];
            
            greets.forEach((g, i) => {
                const val = getName(settings[charId][i]);
                settings[charId][i] = val; // 强制洗白数据并保存纯文本
                sideContainer.append(`
                    <div style="display:flex; align-items:center; gap:10px; margin-bottom:10px;">
                        <span style="flex:1; font-size:0.9em; color:var(--SmartThemeBodyColor);">开场白 ${i+1}: ${g.replace(/\n/g, "").substring(0,15)}...</span>
                        <input type="text" class="text_pole" style="flex:1; cursor:not-allowed;" value="${val}" placeholder="请在 User 面板一键绑定" readonly>
                    </div>
                `);
            });
        }
    }

    if (botPanel.length) {
        const gIdx = getGreetIdx();
        if (charId === undefined || gIdx === -1) {
            $("#aps-injected-info").html(`<span style="opacity:0.6;">请进入聊天查看当前开场白</span>`);
            $("#aps-bind-btn, #aps-unbind-btn").hide();
        } else {
            const val = getName(settings[charId][gIdx]);
            if (val) {
                $("#aps-injected-info").html(`当前开场白: <b>${gIdx+1}</b><br>已绑定人设: <b style="color:var(--SmartThemeQuoteColor);">${val}</b>`);
                $("#aps-bind-btn").html(`<i class="fa-solid fa-rotate"></i> 更新为当前人设`).show();
                $("#aps-unbind-btn").show();
            } else {
                $("#aps-injected-info").html(`当前开场白: <b>${gIdx+1}</b><br>状态: <b>未绑定</b>`);
                $("#aps-bind-btn").html(`<i class="fa-solid fa-link"></i> 一键绑定当前人设`).show();
                $("#aps-unbind-btn").hide();
            }
        }
    }
};

// 注入面板到底栏
const injectBottom = () => {
    if ($("#aps-injected-panel").length) return;
    const pm = $("#PersonaManagement");
    if (!pm.is(":visible")) return;

    const target = pm.find(".inline-drawer-toggle:contains('全局'), .inline-drawer-toggle:contains('Global')").closest(".inline-drawer");
    const html = `
    <div id="aps-injected-panel" style="margin: 15px 0; padding: 12px; border: 1px dashed var(--SmartThemeQuoteColor); border-radius: 8px; background: rgba(0,0,0,0.1);">
        <div style="font-weight: bold; margin-bottom: 8px; color: var(--SmartThemeQuoteColor);"><i class="fa-solid fa-masks-theater"></i> 开场白人设绑定 (联动)</div>
        <div id="aps-injected-info" style="font-size: 0.9em; margin-bottom: 10px;"></div>
        <div style="display:flex; gap: 8px;">
            <button id="aps-bind-btn" class="menu_button" style="flex:1; margin:0;"></button>
            <button id="aps-unbind-btn" class="menu_button danger" style="flex:1; margin:0;"><i class="fa-solid fa-unlink"></i> 解除绑定</button>
        </div>
    </div>`;

    if (target.length) target.before(html); else pm.append(html);

    $("#aps-bind-btn").on("click", () => {
        const ctx = getContext();
        if (ctx.characterId !== undefined && getGreetIdx() !== -1 && ctx.name1) {
            settings[ctx.characterId][getGreetIdx()] = ctx.name1; 
            saveSettingsDebounced();
            toastr.success(`✅ 已绑定至人设: ${ctx.name1}`);
            updateUI();
        }
    });

    $("#aps-unbind-btn").on("click", () => {
        const ctx = getContext();
        if (ctx.characterId !== undefined && getGreetIdx() !== -1 && settings[ctx.characterId]) {
            delete settings[ctx.characterId][getGreetIdx()];
            saveSettingsDebounced();
            toastr.info(`已解除绑定`);
            updateUI();
        }
    });
    updateUI();
};

// 切卡执行
const handleSwitch = async () => {
    updateUI();
    const ctx = getContext();
    if (!ctx.chat || ctx.chat.length !== 1) return;
    
    const charId = ctx.characterId;
    const gIdx = getGreetIdx();
    if (charId !== undefined && gIdx !== -1 && settings[charId]) {
        const target = getName(settings[charId][gIdx]);
        if (target && ctx.name1 !== target) {
            toastr.info(`[自动切卡] 准备切换至: ${target}`);
            setTimeout(async () => {
                const slash = await import('/scripts/slash-commands.js');
                const exec = slash.executeSlashCommandsWithOptions || slash.executeSlashCommands;
                if (exec) {
                    await exec(`/persona "${target}"`);
                    toastr.success(`✅ 已切换至人设: ${target}`);
                    updateUI();
                }
            }, 1000);
        }
    }
};

jQuery(async () => {
    const htmlFile = await $.get(`/scripts/extensions/third-party/${extName}/index.html`);
    const timer = setInterval(() => {
        if ($("#extensions_settings").length && !$("#aps-extension-settings").length) {
            $("#extensions_settings").append(htmlFile);
            $("#aps-save-btn").on("click", () => { saveSettingsDebounced(); toastr.success("已保存！"); });
            updateUI();
            clearInterval(timer);
        }
    }, 500);

    setInterval(() => { if ($("#PersonaManagement").is(":visible")) injectBottom(); }, 500);

    eventSource.on(event_types.CHAT_CHANGED, handleSwitch);
    eventSource.on(event_types.MESSAGE_SWIPED, (idx) => { if (idx === 0) handleSwitch(); });
});
