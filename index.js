import { getContext, extension_settings } from '/scripts/extensions.js';
import { saveSettingsDebounced, eventSource, event_types } from '/script.js';

const extensionName = "Auto-Persona-Switch-NFL"; 
const extensionFolderPath = `/scripts/extensions/third-party/${extensionName}`;

if (!extension_settings[extensionName]) {
    extension_settings[extensionName] = {};
}
let settings = extension_settings[extensionName];

// 1. 纯文本提取器
function getCoreText(text) {
    if (!text) return "";
    let t = text.replace(/\{\{.*?\}\}/g, ''); 
    const ctx = getContext();
    if (ctx && ctx.name1) t = t.replace(new RegExp(ctx.name1, 'gi'), ''); 
    if (ctx && ctx.name2) t = t.replace(new RegExp(ctx.name2, 'gi'), ''); 
    t = t.replace(/<[^>]*>?/gm, ''); 
    t = t.replace(/[^\w\u4e00-\u9fa5]/g, ''); 
    return t.substring(0, 15); 
}

// 2. 获取当前所在的开场白序号
function getCurrentGreetingIndex() {
    const context = getContext();
    const charId = context ? context.characterId : undefined;
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

// 3. 渲染侧边栏扩展面板 (横栏)
function renderMappingUI() {
    const context = getContext();
    const charId = context ? context.characterId : undefined;
    const container = $("#aps-mapping-container");
    if (container.length === 0) return; 

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
         container.append("<p style='opacity: 0.6;'>该角色没有开场白。</p>");
         return;
    }

    if (!settings[charId]) settings[charId] = {};

    greetings.forEach((greetingText, index) => {
        const preview = greetingText.replace(/\n/g, " ").substring(0, 20) + "...";
        const row = $(`<div class="aps-mapping-row" style="margin-bottom: 10px; display: flex; align-items: center; gap: 10px;"></div>`);
        const label = $(`<span style="flex: 1; font-size: 0.9em; color: var(--SmartThemeBodyColor);">开场白 ${index + 1}: ${preview}</span>`);
        
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
    const charId = context ? context.characterId : undefined;
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
        $("#aps-bind-btn").html(`<i class="fa-solid fa-link"></i> 一键绑定当前人设`);
        $("#aps-unbind-btn").hide();
    }
    
    infoDiv.html(infoStr);
    $("#aps-bind-btn").show();
}

// 5. 绝对可见版注入逻辑
function injectIntoPersonaPanel() {
    if ($("#aps-injected-panel").length > 0) return; 
    
    const personaPanel = $("#PersonaManagement");
    if (personaPanel.length === 0 || !personaPanel.is(":visible")) return;

    const injectedHtml = `
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

    let targetArea = null;

    // 方案 A：搜寻“全局设置”黑盒
    personaPanel.find(".inline-drawer-toggle").each(function() {
        const text = $(this).text().trim();
        if (text.includes("全局") || text.includes("Global")) {
            targetArea = $(this).closest(".inline-drawer");
            return false; // 找到就退出循环
        }
    });

    if (targetArea && targetArea.length > 0) {
        // 如果找到了，插在“全局设置”的头顶！
        targetArea.before(injectedHtml);
    } else {
        // 方案 B：终极兜底！直接强行塞在人设面板的“最最最底下”！
        // 如果版本不同导致找不到字，至少你一定能在面板的最底部看到它！
        personaPanel.append(injectedHtml);
    }

    // 绑定事件：一键读取
    $("#aps-bind-btn").off("click").on("click", () => {
        const context = getContext();
        const charId = context ? context.characterId : undefined;
        const gIndex = getCurrentGreetingIndex();
        const personaName = context ? context.name1 : undefined; 

        if (charId !== undefined && gIndex !== -1 && personaName) {
            if (!settings[charId]) settings[charId] = {};
            settings[charId][gIndex] = personaName; 
            saveSettingsDebounced();
            toastr.success(`✅ 开场白 ${gIndex + 1} 已绑定至人设: ${personaName}`);
            renderMappingUI(); 
            updateInjectedPanel();
        }
    });

    $("#aps-unbind-btn").off("click").on("click", () => {
        const context = getContext();
        const charId = context ? context.characterId : undefined;
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

// 6. 初始化扩展横栏
async function initUI() {
    try {
        const htmlFile = await $.get(`${extensionFolderPath}/index.html`);
        
        const checkExtPanel = setInterval(() => {
            if ($("#extensions_settings").length > 0 && $("#aps-extension-settings").length === 0) {
                $("#extensions_settings").append(htmlFile);
                
                $("#aps-save-btn").css("white-space", "nowrap");
                $("#aps-save-btn").on("click", () => {
                    saveSettingsDebounced();
                    toastr.success("设置已保存！"); 
                });

                renderMappingUI();
                clearInterval(checkExtPanel); 
            }
        }, 500);

    } catch (error) {
        console.error(`[${extensionName}] HTML 加载失败:`, error);
    }
}

// 7. 核心切卡逻辑
async function onChatStarted() {
    const context = getContext();
    if (!context.chat || context.chat.length === 0 || context.chat.length > 1) return; 

    const charId = context ? context.characterId : undefined;
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

// 8. 启动器与雷达
jQuery(async () => {
    try {
        await initUI();
        
        setInterval(() => {
            // 只要面板一打开，立刻尝试塞入
            if ($("#PersonaManagement").is(":visible")) {
                injectIntoPersonaPanel();
            }
        }, 500);

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
