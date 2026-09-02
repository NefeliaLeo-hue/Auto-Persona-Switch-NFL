import { getContext, extension_settings } from '/scripts/extensions.js';
import { saveSettingsDebounced, eventSource, event_types } from '/script.js';

const extensionName = "Auto-Persona-Switch-NFL"; 
const extensionFolderPath = `/scripts/extensions/third-party/${extensionName}`;

if (!extension_settings[extensionName]) {
    extension_settings[extensionName] = {};
}
let settings = extension_settings[extensionName];

// 1. 纯文本提取器：提取开场白指纹
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

// 2. 获取当前所在的开场白序号
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

// 3. 渲染侧边栏扩展面板
function renderMappingUI() {
    const context = getContext();
    const charId = context.characterId;
    const container = $("#aps-mapping-container");
    container.empty();

    if (charId === undefined) {
        container.append("<p style='opacity: 0.6;'>请先在主界面选中一张角色卡。</p>");
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
        
        // 恢复成最安全的文本输入框
        const savedValue = settings[charId][index] || "";
        const input = $(`<input type="text" class="text_pole" data-index="${index}" style="flex: 1;" placeholder="填入人设名(留空不切)" value="${savedValue}">`);
        
        input.on("input", function() {
            const val = $(this).val().trim();
            const gIndex = $(this).data("index");
            if (val) {
                settings[charId][gIndex] = val;
            } else {
                delete settings[charId][gIndex];
            }
            // 同步刷新 User 注入面板
            updateInjectedPanel();
        });

        row.append(label);
        row.append(input);
        container.append(row);
    });
}

// 4. 更新 User 注入面板的状态
function updateInjectedPanel() {
    if ($("#aps-injected-panel").length === 0) return; 

    const context = getContext();
    const charId = context.characterId;
    const gIndex = getCurrentGreetingIndex();
    const infoDiv = $("#aps-injected-info");

    if (charId === undefined || gIndex === -1) {
        infoDiv.html(`<span style="opacity:0.6;">请进入聊天查看当前开场白</span>`);
        $("#aps-bind-btn, #aps-unbind-btn").hide();
        return;
    }

    const boundPersona = settings[charId] && settings[charId][gIndex];
    let infoStr = `当前开场白: <b>${gIndex + 1}</b><br>`;
    if (boundPersona) {
        infoStr += `已绑定人设: <b style="color:var(--SmartThemeQuoteColor);">${boundPersona}</b>`;
        $("#aps-bind-btn").html(`<i class="fa-solid fa-rotate"></i> 更新为当前人设`);
        $("#aps-unbind-btn").show();
    } else {
        infoStr += `状态: <b>未绑定</b>`;
        $("#aps-bind-btn").html(`<i class="fa-solid fa-link"></i> 绑定当前人设`);
        $("#aps-unbind-btn").hide();
    }
    
    infoDiv.html(infoStr);
    $("#aps-bind-btn").show();
}

// 5. 注入面板到 User 界面
function injectIntoPersonaPanel() {
    if ($("#aps-injected-panel").length > 0) return; 

    // 寻找注入点：优先找链接区域，找不到就找复选框附近
    let targetArea = $(".persona_binding");
    if (targetArea.length === 0) {
        targetArea = $("input[id='switch_persona_notify']").closest('.checkbox_label').parent();
    }
    if (targetArea.length === 0) return;

    const injectedHtml = `
    <div id="aps-injected-panel" style="margin-top: 15px; padding: 12px; border: 1px dashed var(--SmartThemeQuoteColor); border-radius: 8px; background: rgba(0,0,0,0.1);">
        <div style="font-weight: bold; margin-bottom: 8px; display: flex; align-items: center; gap: 5px; color: var(--SmartThemeQuoteColor);">
            <i class="fa-solid fa-masks-theater"></i> 开场白人设绑定 (联动)
        </div>
        <div id="aps-injected-info" style="font-size: 0.9em; margin-bottom: 10px;"></div>
        <div style="display:flex; gap: 8px;">
            <button id="aps-bind-btn" class="menu_button" style="flex:1; white-space: nowrap;"></button>
            <button id="aps-unbind-btn" class="menu_button danger" style="flex:1; white-space: nowrap;"><i class="fa-solid fa-unlink"></i> 解除绑定</button>
        </div>
    </div>
    `;

    targetArea.after(injectedHtml);

    // 绑定事件：一键读取当前激活的 User
    $("#aps-bind-btn").on("click", () => {
        const context = getContext();
        const charId = context.characterId;
        const gIndex = getCurrentGreetingIndex();
        const personaName = context.name1; // 直接获取当前使用的人设名

        if (charId !== undefined && gIndex !== -1 && personaName) {
            if (!settings[charId]) settings[charId] = {};
            settings[charId][gIndex] = personaName;
            saveSettingsDebounced();
            toastr.success(`✅ 开场白 ${gIndex + 1} 已绑定至人设: ${personaName}`);
            renderMappingUI();
            updateInjectedPanel();
        }
    });

    // 解绑事件
    $("#aps-unbind-btn").on("click", () => {
        const context = getContext();
        const charId = context.characterId;
        const gIndex = getCurrentGreetingIndex();
        
        if (charId !== undefined && gIndex !== -1 && settings[charId]) {
            delete settings[charId][gIndex];
            saveSettingsDebounced();
            toastr.info(`已解除开场白 ${gIndex + 1} 的绑定。`);
            renderMappingUI();
            updateInjectedPanel();
        }
    });

    updateInjectedPanel();
}

// 6. 神级参考：使用 Promise 轮询确保侧边栏一定能加载出来
function waitForElement(selector, timeout = 10000) {
    return new Promise((resolve, reject) => {
        const element = document.querySelector(selector);
        if (element) return resolve(element);

        const observer = new MutationObserver((mutations, obs) => {
            const element = document.querySelector(selector);
            if (element) {
                obs.disconnect();
                resolve(element);
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });

        setTimeout(() => {
            observer.disconnect();
            reject(new Error(`Timeout waiting for ${selector}`));
        }, timeout);
    });
}

// 7. 初始化扩展面板
async function initUI() {
    try {
        const container = await waitForElement("#extensions_settings");
        const htmlFile = await $.get(`${extensionFolderPath}/index.html`);
        $(container).append(htmlFile);

        $("#aps-save-btn").css("white-space", "nowrap");
        $("#aps-save-btn").on("click", () => {
            saveSettingsDebounced();
            toastr.success("设置已保存！"); 
        });

        renderMappingUI();
    } catch (error) {
        console.error(`[${extensionName}] HTML 加载失败:`, error);
    }
}

// 8. 核心切卡逻辑
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
        
        // 使用高效的探头监控 User 面板的打开动作
        const observer = new MutationObserver(() => {
            if ($(".persona_binding").length > 0 || $("#PersonaManagement").is(":visible")) {
                injectIntoPersonaPanel();
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });

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
