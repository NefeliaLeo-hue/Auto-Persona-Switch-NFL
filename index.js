import { getContext, extension_settings, user_avatars } from '/scripts/extensions.js';
import { saveSettingsDebounced, eventSource, event_types } from '/script.js';
import { SlashCommandParser } from '/scripts/slash-commands/SlashCommandParser.js';

const extensionName = "Auto-Persona-Switch-NFL"; 
const extensionFolderPath = `/scripts/extensions/third-party/${extensionName}`;

if (!extension_settings[extensionName]) {
    extension_settings[extensionName] = {};
}
let settings = extension_settings[extensionName];

// 1. 暴力纯文本提取器 (保持不变)
function getCoreText(text) {
    if (!text) return "";
    let t = text.replace(/\{\{.*?\}\}/g, ''); 
    const ctx = getContext();
    if (ctx.name1) t = t.replace(new RegExp(ctx.name1, 'gi'), ''); 
    if (ctx.name2) t = t.replace(new RegExp(ctx.name2, 'gi'), ''); 
    t = t.replace(/<[^>]*>?/gm, ''); 
    t = t.replace(/[^\w\u4e00-\u9fa5]/g, ''); 
    return t.substring(0, 15); 
}

// 2. 获取当前是第几个开场白
function getCurrentGreetingIndex() {
    const context = getContext();
    const charId = context.characterId;
    if (charId === undefined || !context.chat || context.chat.length === 0) return -1;

    const currentChar = context.characters[charId];
    if (!currentChar) return -1;

    const greetings = [];
    if (currentChar.first_mes) greetings.push(currentChar.first_mes);
    if (currentChar.data && currentChar.data.alternate_greetings) {
        greetings.push(...currentChar.data.alternate_greetings);
    }

    const currentCore = getCoreText(context.chat[0].mes);
    for (let i = 0; i < greetings.length; i++) {
        const expectCore = getCoreText(greetings[i]);
        if (currentCore !== "" && expectCore !== "" && currentCore === expectCore) {
            return i;
        }
    }
    return -1;
}

// 3. 生成人设下拉菜单的 HTML
function generatePersonaOptions(selectedValue) {
    let personas = ["User"]; 
    if (Array.isArray(user_avatars) && user_avatars.length > 0) {
        personas = user_avatars;
    }
    let html = `<option value="">(不绑定/留空)</option>`;
    personas.forEach(p => {
        const isSelected = p === selectedValue ? "selected" : "";
        html += `<option value="${p}" ${isSelected}>${p}</option>`;
    });
    return html;
}

// 4. 侧边栏横栏 UI 渲染
function renderMappingUI() {
    const context = getContext();
    const charId = context.characterId;
    const container = $("#aps-mapping-container");
    container.empty();

    if (charId === undefined) {
        container.append("<p>请先在主界面选中一张角色卡。</p>");
        return;
    }

    const currentChar = context.characters[charId];
    if (!currentChar) return;

    const greetings = [];
    if (currentChar.first_mes) greetings.push(currentChar.first_mes);
    if (currentChar.data && currentChar.data.alternate_greetings) {
        greetings.push(...currentChar.data.alternate_greetings);
    }

    if (greetings.length === 0) {
         container.append("<p>该角色没有开场白。</p>");
         return;
    }

    if (!settings[charId]) settings[charId] = {};

    greetings.forEach((greetingText, index) => {
        const preview = greetingText.replace(/\n/g, " ").substring(0, 20) + "...";
        const row = $(`<div class="aps-mapping-row" style="margin-bottom: 10px; display: flex; align-items: center; gap: 10px;"></div>`);
        const label = $(`<span style="flex: 1; font-size: 0.9em; color: var(--SmartThemeBodyColor);">开场白 ${index + 1}: ${preview}</span>`);
        
        const savedValue = settings[charId][index] || "";
        const select = $(`<select class="text_pole" data-index="${index}" style="flex: 1;">${generatePersonaOptions(savedValue)}</select>`);
        
        select.on("change", function() {
            const val = $(this).val();
            const gIndex = $(this).data("index");
            if (val) {
                settings[charId][gIndex] = val;
            } else {
                delete settings[charId][gIndex];
            }
            // 数据变动后，立刻同步刷新 User 面板
            updateInjectedPanel();
        });

        row.append(label);
        row.append(select);
        container.append(row);
    });
}

// 5. 动态更新 User 注入面板的显示状态
function updateInjectedPanel() {
    if ($("#aps-injected-panel").length === 0) return; 

    const context = getContext();
    const charId = context.characterId;
    const gIndex = getCurrentGreetingIndex();
    const infoDiv = $("#aps-injected-info");

    if (charId === undefined || gIndex === -1) {
        infoDiv.html(`<span style="color: gray;">请先进入聊天，并确保位于第一句话以识别当前开场白。</span>`);
        $("#aps-injected-select").hide();
        return;
    }

    infoDiv.html(`当前正在使用: <b>开场白 ${gIndex + 1}</b>`);
    
    // 更新下拉菜单的值，保持双向同步
    const savedValue = settings[charId] && settings[charId][gIndex] ? settings[charId][gIndex] : "";
    const selectEl = $("#aps-injected-select");
    selectEl.html(generatePersonaOptions(savedValue)).show();
    
    // 重新绑定下拉菜单事件
    selectEl.off("change").on("change", function() {
        const val = $(this).val();
        if (val) {
            settings[charId][gIndex] = val;
            toastr.success(`✅ 开场白 ${gIndex + 1} 已绑定至人设: ${val}`);
        } else {
            delete settings[charId][gIndex];
            toastr.info(`已解除开场白 ${gIndex + 1} 的绑定。`);
        }
        saveSettingsDebounced();
        renderMappingUI(); // 立刻同步刷新侧边栏
    });
}

// 6. 参考作者的轮询注入法：强行把 UI 塞入原生 User 面板
function injectIntoPersonaPanel() {
    if ($("#aps-injected-panel").length > 0) return; // 已经有了就不塞了

    // 寻找注入点：优先找你截图里的锁（.persona_binding），找不到就找描述框的父级
    let targetArea = $("#PersonaManagement .persona_binding");
    if (targetArea.length === 0) {
        targetArea = $("#PersonaManagement textarea[id*='description']").parent();
    }
    if (targetArea.length === 0) return; // 面板还没准备好，跳过等下一次轮询

    const injectedHtml = `
    <div id="aps-injected-panel" style="margin-top: 15px; padding: 12px; border: 1px dashed var(--SmartThemeQuoteColor); border-radius: 8px; background: rgba(0,0,0,0.1);">
        <div style="font-weight: bold; margin-bottom: 8px; display: flex; align-items: center; gap: 5px; color: var(--SmartThemeQuoteColor);">
            <i class="fa-solid fa-masks-theater"></i> 开场白人设绑定 (联动)
        </div>
        <div id="aps-injected-info" style="font-size: 0.9em; margin-bottom: 8px;"></div>
        <select id="aps-injected-select" class="text_pole" style="width: 100%; display: none;"></select>
    </div>
    `;

    targetArea.after(injectedHtml);
    updateInjectedPanel();
}

// 7. 初始化 UI
async function initUI() {
    try {
        const htmlFile = await $.get(`${extensionFolderPath}/index.html`);
        $("#extensions_settings").append(htmlFile);

        $("#aps-save-btn").css("white-space", "nowrap");
        $("#aps-save-btn").on("click", () => {
            saveSettingsDebounced();
            toastr.success("设置已保存！"); 
        });

        renderMappingUI();

        // 【终极武器】：每 500 毫秒扫描一次页面，只要 User 面板打开了且没有我们的 UI，就强行塞入！
        setInterval(() => {
            const personaPanel = $("#PersonaManagement");
            if (personaPanel.length > 0 && personaPanel.is(":visible")) {
                injectIntoPersonaPanel();
            }
        }, 500);

    } catch (error) {
        console.error(`[${extensionName}] HTML 加载失败:`, error);
    }
}

// 8. 切卡触发逻辑
async function onChatStarted() {
    const context = getContext();
    if (!context.chat || context.chat.length === 0 || context.chat.length > 1) return; 

    const charId = context.characterId;
    const gIndex = getCurrentGreetingIndex();

    if (charId !== undefined && gIndex !== -1 && settings[charId] && settings[charId][gIndex]) {
        const targetPersona = settings[charId][gIndex];
        
        toastr.info(`[自动切卡] 检测到开场白 ${gIndex + 1}，准备切换至: ${targetPersona}`);
        
        setTimeout(async () => {
            try {
                const slashModule = await import('/scripts/slash-commands.js');
                const executeSlash = slashModule.executeSlashCommandsWithOptions || slashModule.executeSlashCommands;
                if (executeSlash) {
                    await executeSlash(`/persona "${targetPersona}"`);
                    toastr.success(`✅ 已强制切换人设至: ${targetPersona}`);
                    // 切完人设后，让所有 UI 刷新一次
                    updateInjectedPanel();
                }
            } catch (err) {
                console.error(`[${extensionName}] 命令执行失败:`, err);
            }
        }, 1000); 
    } else {
        updateInjectedPanel();
    }
}

jQuery(async () => {
    try {
        await initUI();
        eventSource.on(event_types.CHAT_CHANGED, () => {
            renderMappingUI();
            updateInjectedPanel();
            onChatStarted();
        });
        eventSource.on(event_types.MESSAGE_SWIPED, (index) => {
            if (index === 0) {
                onChatStarted();
                updateInjectedPanel();
            }
        });
    } catch (error) {
        console.error(`[${extensionName}] 致命错误:`, error);
    }
});
