import { getContext, extension_settings } from '/scripts/extensions.js';
import { saveSettingsDebounced, eventSource, event_types } from '/script.js';

const extensionName = "Auto-Persona-Switch-NFL"; 
const extensionFolderPath = `/scripts/extensions/third-party/${extensionName}`;

if (!extension_settings[extensionName]) {
    extension_settings[extensionName] = {};
}
const settings = extension_settings[extensionName];

// 彻底清除历史 [object Object] 脏数据，仅保留纯文本名字
function getCleanName(val) {
    if (!val) return "";
    if (typeof val === 'object') val = val.name || "";
    val = String(val).trim();
    return val.includes('[object') ? "" : val;
}

// 抓取用户在面板输入的真实名字
function getCurrentUserName() {
    return $("#your_name").val()?.trim() || getContext().name1 || "";
}

// 获取当前开场白序号
function getGreetingIndex() {
    const ctx = getContext();
    if (!ctx?.chat?.length || ctx.characterId === undefined) return -1;
    const char = ctx.characters[ctx.characterId];
    if (!char) return -1;

    const clean = t => (t || '').replace(/\{\{.*?\}\}/g, '').replace(/<[^>]*>?/gm, '').replace(/[^\w\u4e00-\u9fa5]/g, '').substring(0, 15);
    const cur = clean(ctx.chat[0].mes);
    const list = [char.first_mes].concat(char.data?.alternate_greetings || []);
    return list.findIndex(g => clean(g) === cur);
}

// 双栏统一刷新：保证横栏和底栏状态时刻严格一致
function updateAllUI() {
    const ctx = getContext();
    const charId = ctx?.characterId;

    // 1. 刷新横栏
    const container = $("#aps-mapping-container");
    if (container.length) {
        container.empty();
        if (charId === undefined) {
            container.append("<p style='opacity:0.6;'>请先选中角色卡</p>");
        } else {
            if (!settings[charId]) settings[charId] = {};
            const char = ctx.characters[charId];
            const greetings = [char.first_mes].concat(char.data?.alternate_greetings || []);
            
            greetings.forEach((g, idx) => {
                const name = getCleanName(settings[charId][idx]);
                settings[charId][idx] = name; // 纠正清洗
                const preview = g.replace(/\n/g, ' ').substring(0, 20) + '...';
                
                const row = $(`
                    <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
                        <span style="flex:1; font-size:0.9em;">开场白 ${idx + 1}: ${preview}</span>
                        <input type="text" class="text_pole" data-index="${idx}" style="flex:1;" value="${name}" placeholder="填入或在下方绑定">
                    </div>
                `);
                
                row.find('input').on('input', function() {
                    const val = getCleanName($(this).val());
                    if (val) settings[charId][idx] = val;
                    else delete settings[charId][idx];
                    updateInjectedPanelOnly();
                });
                container.append(row);
            });
        }
    }

    updateInjectedPanelOnly();
}

function updateInjectedPanelOnly() {
    const ctx = getContext();
    const charId = ctx?.characterId;
    const gIndex = getGreetingIndex();
    const panel = $("#aps-injected-panel");
    if (!panel.length) return;

    const info = $("#aps-injected-info");
    const bindBtn = $("#aps-bind-btn");
    const unbindBtn = $("#aps-unbind-btn");

    if (charId === undefined || gIndex === -1) {
        info.html("<span style='opacity:0.6;'>请在聊天第一条消息处查看开场白</span>");
        bindBtn.hide();
        unbindBtn.hide();
        return;
    }

    const currentBinding = getCleanName(settings[charId]?.[gIndex]);
    if (currentBinding) {
        info.html(`当前开场白: <b>${gIndex + 1}</b><br>已绑定人设: <b style="color:var(--SmartThemeQuoteColor);">${currentBinding}</b>`);
        bindBtn.html('<i class="fa-solid fa-rotate"></i> 更新为当前人设').show();
        unbindBtn.show();
    } else {
        info.html(`当前开场白: <b>${gIndex + 1}</b><br>状态: <b>未绑定</b>`);
        bindBtn.html('<i class="fa-solid fa-link"></i> 绑定当前人设').show();
        unbindBtn.hide();
    }
}

// 注入 User 面板
function injectIntoPersonaPanel() {
    if ($("#aps-injected-panel").length > 0) return;
    const personaPanel = $("#PersonaManagement");
    if (!personaPanel.is(":visible")) return;

    const drawer = personaPanel.find(".inline-drawer-toggle:contains('全局'), .inline-drawer-toggle:contains('Global')").closest(".inline-drawer");
    const html = `
    <div id="aps-injected-panel" style="margin:12px 0; padding:10px; border:1px dashed var(--SmartThemeQuoteColor); border-radius:6px; background:rgba(0,0,0,0.05);">
        <div style="font-weight:bold; margin-bottom:6px; color:var(--SmartThemeQuoteColor);">
            <i class="fa-solid fa-masks-theater"></i> 开场白人设绑定 (联动)
        </div>
        <div id="aps-injected-info" style="font-size:0.9em; margin-bottom:8px;"></div>
        <div style="display:flex; gap:8px;">
            <button id="aps-bind-btn" class="menu_button" style="flex:1; white-space:nowrap; margin:0;"></button>
            <button id="aps-unbind-btn" class="menu_button danger" style="flex:1; white-space:nowrap; margin:0;"><i class="fa-solid fa-unlink"></i> 解除</button>
        </div>
    </div>`;

    if (drawer.length) drawer.before(html);
    else personaPanel.append(html);

    $("#aps-bind-btn").on("click", () => {
        const ctx = getContext();
        const charId = ctx?.characterId;
        const gIdx = getGreetingIndex();
        const userName = getCurrentUserName();

        if (charId !== undefined && gIdx !== -1 && userName) {
            if (!settings[charId]) settings[charId] = {};
            settings[charId][gIdx] = userName;
            saveSettingsDebounced();
            toastr.success(`user 已绑定: ${userName}`);
            updateAllUI();
        }
    });

    $("#aps-unbind-btn").on("click", () => {
        const charId = getContext()?.characterId;
        const gIdx = getGreetingIndex();
        if (charId !== undefined && gIdx !== -1 && settings[charId]) {
            delete settings[charId][gIdx];
            saveSettingsDebounced();
            toastr.info("已解除绑定");
            updateAllUI();
        }
    });

    updateInjectedPanelOnly();
}

// 自动切换
async function handlePersonaSwitch() {
    updateAllUI();
    const ctx = getContext();
    if (!ctx?.chat?.length || ctx.chat.length > 1) return;

    const charId = ctx.characterId;
    const gIdx = getGreetingIndex();
    const targetName = getCleanName(settings[charId]?.[gIdx]);

    if (targetName && ctx.name1 !== targetName) {
        setTimeout(async () => {
            try {
                const slash = await import('/scripts/slash-commands.js');
                const exec = slash.executeSlashCommandsWithOptions || slash.executeSlashCommands;
                if (exec) {
                    await exec(`/persona "${targetName}"`);
                    toastr.success(`已切换至人设: ${targetName}`);
                    updateAllUI();
                }
            } catch (e) {
                console.error(`[${extensionName}] 切换失败:`, e);
            }
        }, 800);
    }
}

jQuery(async () => {
    const html = await $.get(`${extensionFolderPath}/index.html`);
    const timer = setInterval(() => {
        if ($("#extensions_settings").length && !$("#aps-extension-settings").length) {
            $("#extensions_settings").append(html);
            $("#aps-save-btn").on("click", () => {
                saveSettingsDebounced();
                toastr.success("设置已保存！");
            });
            updateAllUI();
            clearInterval(timer);
        }
    }, 500);

    setInterval(() => {
        if ($("#PersonaManagement").is(":visible")) injectIntoPersonaPanel();
    }, 500);

    eventSource.on(event_types.CHAT_CHANGED, handlePersonaSwitch);
    eventSource.on(event_types.MESSAGE_SWIPED, idx => { if (idx === 0) handlePersonaSwitch(); });
});
