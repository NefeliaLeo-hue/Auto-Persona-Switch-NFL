import { getContext, extension_settings } from '/scripts/extensions.js';
import { saveSettingsDebounced, eventSource, event_types } from '/script.js';

const extName = "Auto-Persona-Switch-NFL";
if (!extension_settings[extName]) extension_settings[extName] = {};
const settings = extension_settings[extName];

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
                settings[charId][i] = val; 
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

// 🌟 新增：安全防覆写弹窗！
const askToSwitchPersona = (targetName, currentName) => {
    if ($("#aps-confirm-modal").length > 0) return; // 避免重复弹窗

    const modalHtml = `
    <div id="aps-confirm-modal" style="position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.6); z-index: 99999; display: flex; justify-content: center; align-items: center;">
        <div style="background: var(--SmartThemeBlurTintColor); border: 1px solid var(--SmartThemeQuoteColor); padding: 25px; border-radius: 12px; text-align: center; max-width: 85%; box-shadow: 0 10px 30px rgba(0,0,0,0.7); backdrop-filter: blur(5px);">
            <h3 style="margin-top:0; color: var(--SmartThemeBodyColor); display: flex; align-items: center; justify-content: center; gap: 8px;">
                <i class="fa-solid fa-triangle-exclamation" style="color: #ff9800;"></i> 发现不同的人设配置
            </h3>
            <div style="color: var(--SmartThemeBodyColor); text-align: left; margin: 15px 0; font-size: 0.95em; line-height: 1.5;">
                此开场白绑定的目标人设为：<b style="color: var(--SmartThemeQuoteColor);">${targetName}</b><br>
                当前正在使用的人设为：<b>${currentName}</b>
            </div>
            <p style="color: var(--SmartThemeBodyColor); font-size: 0.8em; opacity: 0.7; text-align: left; margin-bottom: 20px;">
                ⚠️ <b>防冲突提示</b>：如果该角色已经在酒馆自带设置中锁定了特定的主控（User），强烈建议点击“取消切换”，以酒馆原生配置为最高优先级，防止发生覆写冲突！
            </p>
            <div style="display: flex; gap: 10px; justify-content: center;">
                <button id="aps-btn-no" class="menu_button danger" style="margin:0; flex:1;">取消切换</button>
                <button id="aps-btn-yes" class="menu_button" style="margin:0; flex:1;">强制切换</button>
            </div>
        </div>
    </div>
    `;
    
    $("body").append(modalHtml);

    // 选项 1：听酒馆的话，不切了（绝对安全）
    $("#aps-btn-no").on("click", () => {
        $("#aps-confirm-modal").remove();
        toastr.info("已放弃跳转，保留当前人设。");
    });

    // 选项 2：强制切换（用户手动触发，没有并发覆写风险）
    $("#aps-btn-yes").on("click", async () => {
        $("#aps-confirm-modal").remove();
        try {
            const slash = await import('/scripts/slash-commands.js');
            const exec = slash.executeSlashCommandsWithOptions || slash.executeSlashCommands;
            if (exec) {
                await exec(`/persona "${targetName}"`);
                toastr.success(`✅ 已切换至人设: ${targetName}`);
                updateUI();
            }
        } catch (err) {
            console.error("切卡失败", err);
        }
    });
};

const handleSwitch = async () => {
    updateUI();
    const ctx = getContext();
    // 只有在仅有一条消息（开场白）时才触发判断，防止中途读档触发
    if (!ctx.chat || ctx.chat.length !== 1) return; 
    
    const charId = ctx.characterId;
    const gIdx = getGreetIdx();
    
    if (charId !== undefined && gIdx !== -1 && settings[charId]) {
        const target = getName(settings[charId][gIdx]);
        
        // 🚨 核心护盾启动：如果发现开场白设定的名字 和 酒馆当前载入的名字 不一样
        if (target && ctx.name1 !== target) {
            // 抛弃自动刷新覆写，改为温柔地弹窗询问用户！
            askToSwitchPersona(target, ctx.name1);
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
