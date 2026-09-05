import { getContext, extension_settings } from '/scripts/extensions.js';
import { saveSettingsDebounced, eventSource, event_types } from '/script.js';

const extensionName = "Auto-Persona-Switch-NFL"; 
const extensionFolderPath = `/scripts/extensions/third-party/${extensionName}`;

if (!extension_settings[extensionName]) {
    extension_settings[extensionName] = {};
}
const settings = extension_settings[extensionName];

// 1. 核心逻辑
function getGreetingIndex() {
    const ctx = getContext();
    if (!ctx || !ctx.chat || ctx.chat.length === 0 || ctx.characterId === undefined) return -1;

    const char = ctx.characters[ctx.characterId];
    if (!char) return -1;

    const normalize = t => (t||'').replace(/\{\{.*?\}\}/g, '').replace(/<[^>]*>?/gm, '').replace(/[^\w\u4e00-\u9fa5]/g, '').substring(0, 15);
    const current = normalize(ctx.chat[0].mes);
    
    const greetings = [char.first_mes].concat(char.data?.alternate_greetings || []);
    return greetings.findIndex(g => normalize(g) === current);
}

// 2. 统一 UI 刷新枢纽！
function updateAllUI() {
    const ctx = getContext();
    const charId = ctx ? ctx.characterId : undefined;
    
    // ======== 更新侧边栏(横栏) ========
    const sidebarContainer = $("#aps-mapping-container");
    if (sidebarContainer.length > 0) {
        sidebarContainer.empty();
        if (charId === undefined) {
            sidebarContainer.append("<p style='opacity: 0.6;'>请先在主界面选中一张角色卡。</p>");
        } else {
            if (!settings[charId]) settings[charId] = {};
            const char = ctx.characters[charId];
            const greetings = [char.first_mes].concat(char.data?.alternate_greetings || []);
            
            greetings.forEach((g, index) => {
                const preview = g.replace(/\n/g, " ").substring(0, 20) + "...";
                let savedName = settings[charId][index] || "";
                
                // 修复上个版本遗留的 [object Object] 报错
                if (typeof savedName === 'object') {
                    savedName = savedName.name || "";
                    settings[charId][index] = savedName; // 纠正回纯文本
                }

                sidebarContainer.append(`
                    <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">
                        <span style="flex: 1; font-size: 0.9em; color: var(--SmartThemeBodyColor);">开场白 ${index + 1}: ${preview}</span>
                        <input type="text" class="text_pole" style="flex: 1; cursor: not-allowed;" value="${savedName}" placeholder="请在 User 面板点击绑定" readonly title="为确保同步，请打开人设(User)面板使用一键绑定功能。">
                    </div>
                `);
            });
        }
    }

    // ======== 更新人设面板(底栏) ========
    const injectedPanel = $("#aps-injected-panel");
    if (injectedPanel.length > 0) {
        const gIndex = getGreetingIndex();
        const infoDiv = $("#aps-injected-info");
        const bindBtn = $("#aps-bind-btn");
        const unbindBtn = $("#aps-unbind-btn");

        if (charId === undefined || gIndex === -1) {
            infoDiv.html(`<span style="opacity:0.6;">请进入聊天以查看并绑定开场白</span>`);
            bindBtn.hide(); unbindBtn.hide();
        } else {
            let savedName = settings[charId][gIndex] || "";
            if (typeof savedName === 'object') savedName = savedName.name || ""; // 清理垃圾数据

            if (savedName) {
                infoDiv.html(`当前开场白: <b>${gIndex + 1}</b><br>已绑定人设: <b style="color:var(--SmartThemeQuoteColor);">${savedName}</b>`);
                bindBtn.html(`<i class="fa-solid fa-rotate"></i> 更新为当前人设`).show();
                unbindBtn.show();
            } else {
                infoDiv.html(`当前开场白: <b>${gIndex + 1}</b><br>状态: <b>未绑定</b>`);
                bindBtn.html(`<i class="fa-solid fa-link"></i> 一键绑定当前人设`).show();
                unbindBtn.hide();
            }
        }
    }
}

// 3. 将联动面板安全注入到 User 界面
function injectIntoPersonaPanel() {
    if ($("#aps-injected-panel").length > 0) return; 
    
    const personaPanel = $("#PersonaManagement");
    if (!personaPanel.is(":visible")) return;

    let targetArea = personaPanel.find(".inline-drawer-toggle:contains('全局'), .inline-drawer-toggle:contains('Global')").closest(".inline-drawer");

    const html = `
    <div id="aps-injected-panel" style="margin: 15px 0; padding: 12px; border: 1px dashed var(--SmartThemeQuoteColor); border-radius: 8px; background: rgba(0,0,0,0.1);">
        <div style="font-weight: bold; margin-bottom: 8px; display: flex; align-items: center; gap: 5px; color: var(--SmartThemeQuoteColor);">
            <i class="fa-solid fa-masks-theater"></i> 开场白人设绑定 (联动)
        </div>
        <div id="aps-injected-info" style="font-size: 0.9em; margin-bottom: 10px;"></div>
        <div style="display:flex; gap: 8px;">
            <button id="aps-bind-btn" class="menu_button" style="flex:1; white-space: nowrap; margin:0;"></button>
            <button id="aps-unbind-btn" class="menu_button danger" style="flex:1; white-space: nowrap; margin:0;"><i class="fa-solid fa-unlink"></i> 解除绑定</button>
        </div>
    </div>
    `;

    if (targetArea.length > 0) targetArea.before(html);
    else personaPanel.append(html);

    // 绑定事件：只抓取酒馆真实的当前用户名 (context.name1)
    $("#aps-bind-btn").on("click", () => {
        const ctx = getContext();
        const charId = ctx.characterId;
        const gIndex = getGreetingIndex();
        const realUserName = ctx.name1; 

        if (charId !== undefined && gIndex !== -1 && realUserName) {
            settings[charId][gIndex] = realUserName; // 只存最干净的纯文本
            saveSettingsDebounced();
            toastr.success(`✅ 已绑定至人设: ${realUserName}`);
            updateAllUI(); // 点完瞬间刷新两边，保证100%同步
        }
    });

    $("#aps-unbind-btn").on("click", () => {
        const charId = getContext().characterId;
        const gIndex = getGreetingIndex();
        
        if (charId !== undefined && gIndex !== -1 && settings[charId]) {
            delete settings[charId][gIndex];
            saveSettingsDebounced();
            toastr.info(`已解除绑定`);
            updateAllUI(); // 点完瞬间刷新两边，保证100%同步
        }
    });

    updateAllUI(); // 注入完立刻同步一次
}

// 4. 智能切卡逻辑
async function handlePersonaSwitch() {
    updateAllUI(); // 聊天变动时刷新所有UI

    const ctx = getContext();
    if (!ctx.chat || ctx.chat.length === 0 || ctx.chat.length > 1) return; 

    const charId = ctx.characterId;
    const gIndex = getGreetingIndex();

    if (charId !== undefined && gIndex !== -1 && settings[charId] && settings[charId][gIndex]) {
        let targetName = settings[charId][gIndex];
        if (typeof targetName === 'object') targetName = targetName.name; // 垃圾数据兼容处理

        // 如果当前名字已经是目标名字，就不切了，安静地呆着
        if (ctx.name1 === targetName) return;

        toastr.info(`[自动切卡] 检测到开场白 ${gIndex + 1}，准备切换至: ${targetName}`);
        
        setTimeout(async () => {
            try {
                const slashModule = await import('/scripts/slash-commands.js');
                const executeSlash = slashModule.executeSlashCommandsWithOptions || slashModule.executeSlashCommands;
                if (executeSlash) {
                    await executeSlash(`/persona "${targetName}"`);
                    toastr.success(`✅ 已切换至人设: ${targetName}`);
                    updateAllUI();
                }
            } catch (err) {
                console.error(`[${extensionName}] 切卡失败:`, err);
            }
        }, 1000); 
    }
}

// 5. 初始化与雷达监控
jQuery(async () => {
    const htmlFile = await $.get(`${extensionFolderPath}/index.html`);
    
    // 初始化横栏
    const checkExtPanel = setInterval(() => {
        if ($("#extensions_settings").length > 0 && $("#aps-extension-settings").length === 0) {
            $("#extensions_settings").append(htmlFile);
            $("#aps-save-btn").on("click", () => { saveSettingsDebounced(); toastr.success("设置已保存！"); });
            updateAllUI();
            clearInterval(checkExtPanel); 
        }
    }, 500);

    // 监控 User 面板
    setInterval(() => {
        if ($("#PersonaManagement").is(":visible")) injectIntoPersonaPanel();
    }, 500);

    // 监听聊天变动与滑动
    eventSource.on(event_types.CHAT_CHANGED, handlePersonaSwitch);
    eventSource.on(event_types.MESSAGE_SWIPED, (index) => { if (index === 0) handlePersonaSwitch(); });
});
