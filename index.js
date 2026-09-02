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
        
        // 兼容处理：老版本存的是字符串，新版本(ID隔离)存的是对象
        const savedData = settings[charId][index];
        const savedValue = typeof savedData === 'string' ? savedData : (savedData ? savedData.name : "");

        const input = $(`<input type="text" class="text_pole" data-index="${index}" style="flex: 1;" placeholder="填入人设名(留空不切)" value="${savedValue}">`);
        
        input.on("input", function() {
            const val = $(this).val().trim();
            const gIndex = $(this).data("index");
            if (val) {
                // 手动打字降级为字符串匹配，因为用户不知道底层ID
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

    const savedData = settings[charId] && settings[charId][gIndex];
    let infoStr = `当前开场白: <b>${gIndex + 1}</b><br>`;
    
    if (savedData) {
        const boundName = typeof savedData === 'string' ? savedData : savedData.name;
        infoStr += `已绑定人设: <b style="color:var(--SmartThemeQuoteColor);">${boundName}</b>`;
        // 如果底层是对象，说明是高精度 ID 绑定
        if (typeof savedData === 'object') {
            infoStr += ` <span style="opacity:0.5; font-size:0.8em;">(精确绑定)</span>`;
        }
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

// 5. 注入面板到 User 界面
function injectIntoPersonaPanel() {
    if ($("#aps-injected-panel").length > 0) return; 

    let targetArea = null;
    $("#PersonaManagement label, #PersonaManagement span, #PersonaManagement div, #PersonaManagement fieldset").each(function() {
        if ($(this).contents().filter(function(){ return this.nodeType === 3; }).text().trim() === "全局设置") {
            targetArea = $(this);
            return false; 
        }
    });

    if (!targetArea || targetArea.length === 0) {
        const notifyCheckbox = $("input#switch_persona_notify");
        if (notifyCheckbox.length > 0) {
            targetArea = notifyCheckbox.closest('.checkbox_label');
        }
    }

    if (!targetArea || targetArea.length === 0) return; 

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

    targetArea.before(injectedHtml);

    // 【核心黑科技】：一键绑定时，悄悄抓取底层文件 ID
    $("#aps-bind-btn").on("click", () => {
        const context = getContext();
        const charId = context ? context.characterId : undefined;
        const gIndex = getCurrentGreetingIndex();
        
        // 从原生的人设下拉菜单中，获取该人设真正的、独一无二的文件名/ID
        const personaSelect = $("#PersonaManagement select").first();
        let uniqueId = personaSelect.val();
        let displayName = personaSelect.find("option:selected").text() || (context ? context.name1 : "未命名");

        // 极端防呆：如果下拉菜单没抓到，回退到普通名字绑定
        if (!uniqueId) {
            uniqueId = context ? context.name1 : undefined;
            displayName = uniqueId;
        }

        if (charId !== undefined && gIndex !== -1 && uniqueId) {
            if (!settings[charId]) settings[charId] = {};
            
            // 把唯一ID和显示名字一起打包存起来！
            settings[charId][gIndex] = {
                id: uniqueId,
                name: displayName
            }; 
            
            saveSettingsDebounced();
            toastr.success(`✅ 开场白 ${gIndex + 1} 已精准绑定至人设: ${displayName}`);
            renderMappingUI(); 
            updateInjectedPanel();
        }
    });

    $("#aps-unbind-btn").on("click", () => {
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
        const savedData = settings[charId][gIndex];
        
        // 智能解析：如果是老版本的字符串就用字符串，是新版本的对象就提取精确的 ID
        const targetId = typeof savedData === 'string' ? savedData : savedData.id;
        const targetName = typeof savedData === 'string' ? savedData : savedData.name;
        
        toastr.info(`[自动切卡] 检测到开场白 ${gIndex + 1}，准备切换至: ${targetName}`);
        
        setTimeout(async () => {
            try {
                const slashModule = await import('/scripts/slash-commands.js');
                const executeSlash = slashModule.executeSlashCommandsWithOptions || slashModule.executeSlashCommands;
                if (executeSlash) {
                    // 把独一无二的底层 ID 交给系统，系统绝对不会认错！
                    await executeSlash(`/persona "${targetId}"`);
                    toastr.success(`✅ 已强制精确切换至人设: ${targetName}`);
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
            if ($("#switch_persona_notify").length > 0 && $("#aps-injected-panel").length === 0) {
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
