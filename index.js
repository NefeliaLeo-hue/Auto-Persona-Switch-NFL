import { getContext, extension_settings } from '/scripts/extensions.js';
import { saveSettingsDebounced, eventSource, event_types } from '/script.js';
import { SlashCommandParser } from '/scripts/slash-commands/SlashCommandParser.js';

const extensionName = "Auto-Persona-Switch-NFL"; 
const extensionFolderPath = `/scripts/extensions/third-party/${extensionName}`;

if (!extension_settings[extensionName]) {
    extension_settings[extensionName] = {};
}
let settings = extension_settings[extensionName];

// 1. 硬核纯文本提取器 (保持不变，完美运行)
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

// 2. 辅助函数：获取当前正在使用的是第几个开场白
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

// 3. 动态更新 User 面板里被注入的 UI 状态
function updateInjectedPanel() {
    if ($("#aps-injected-panel").length === 0) return; // 面板还没被加载出来就跳过

    const context = getContext();
    const charId = context.characterId;
    const gIndex = getCurrentGreetingIndex();
    
    const infoDiv = $("#aps-current-greeting-info");
    const bindBtn = $("#aps-bind-btn");
    const unbindBtn = $("#aps-unbind-btn");

    if (charId === undefined || gIndex === -1) {
        infoDiv.html(`<span style="color: var(--SmartThemeQuoteColor);">请先进入聊天，并确保位于第一句话以识别开场白。</span>`);
        bindBtn.hide();
        unbindBtn.hide();
        return;
    }

    infoDiv.html(`当前检测到: <b style="color: var(--SmartThemeBodyColor);">开场白 ${gIndex + 1}</b>`);
    
    const boundPersona = settings[charId] && settings[charId][gIndex];
    if (boundPersona) {
        infoDiv.append(`<br>已绑定人设: <b style="color: var(--SmartThemeBodyColor);">${boundPersona}</b>`);
        bindBtn.html(`<i class="fa-solid fa-link"></i> 更新绑定为当前人设`).show();
        unbindBtn.show();
    } else {
        infoDiv.append(`<br><span style="color: gray;">此开场白尚未绑定人设</span>`);
        bindBtn.html(`<i class="fa-solid fa-link"></i> 绑定当前人设`).show();
        unbindBtn.hide();
    }
}

// 4. 核心功能：将 UI 动态注入到 User 面板的“链接”下方
function injectIntoPersonaPanel() {
    if ($("#aps-injected-panel").length > 0) return; // 防止重复注入

    // 寻找原生“链接”区域
    const bindingDiv = $(".persona_binding");
    if (bindingDiv.length === 0) return;

    // 构造我们自己的联动 UI 面板
    const injectedHtml = `
    <div id="aps-injected-panel" style="margin-top: 15px; padding: 12px; border: 1px dashed var(--SmartThemeBorderColor); border-radius: 8px; background: rgba(0,0,0,0.05);">
        <div style="font-weight: bold; margin-bottom: 8px; display: flex; align-items: center; gap: 5px;">
            <i class="fa-solid fa-masks-theater"></i> 开场白自动人设绑定
        </div>
        <div id="aps-current-greeting-info" style="font-size: 0.9em; margin-bottom: 10px;"></div>
        <button id="aps-bind-btn" class="menu_button" style="width: 100%; white-space: nowrap; margin-bottom: 5px;">
            <i class="fa-solid fa-link"></i> 绑定
        </button>
        <button id="aps-unbind-btn" class="menu_button danger" style="width: 100%; white-space: nowrap;">
            <i class="fa-solid fa-unlink"></i> 解除绑定
        </button>
    </div>
    `;

    // 塞入原生锁定区的下方
    bindingDiv.after(injectedHtml);

    // 绑定按钮事件
    $("#aps-bind-btn").on("click", () => {
        const context = getContext();
        const charId = context.characterId;
        const gIndex = getCurrentGreetingIndex();
        const currentPersonaName = context.name1; // 获取当前激活的人设名

        if (charId !== undefined && gIndex !== -1 && currentPersonaName) {
            if (!settings[charId]) settings[charId] = {};
            settings[charId][gIndex] = currentPersonaName; // 写入数据
            saveSettingsDebounced();
            toastr.success(`✅ 已将 开场白 ${gIndex + 1} 与人设 "${currentPersonaName}" 绑定！`);
            renderMappingUI(); // 同步更新侧边栏横栏
            updateInjectedPanel(); // 更新自身 UI
        } else {
            toastr.warning("绑定失败：未能获取到正确的开场白或人设状态。");
        }
    });

    // 解除绑定事件
    $("#aps-unbind-btn").on("click", () => {
        const context = getContext();
        const charId = context.characterId;
        const gIndex = getCurrentGreetingIndex();

        if (charId !== undefined && gIndex !== -1 && settings[charId]) {
            delete settings[charId][gIndex]; // 删除数据
            saveSettingsDebounced();
            toastr.info(`已解除开场白 ${gIndex + 1} 的绑定。`);
            renderMappingUI(); // 同步更新侧边栏横栏
            updateInjectedPanel(); // 更新自身 UI
        }
    });

    updateInjectedPanel();
}

// 5. 侧边栏列表 UI 渲染 (加入双向同步)
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
        const input = $(`<input type="text" class="text_pole" data-index="${index}" style="flex: 1;" placeholder="填入人设名(留空不切)" value="${savedValue}">`);
        
        input.on("input", function() {
            const val = $(this).val().trim();
            const gIndex = $(this).data("index");
            if (val) {
                settings[charId][gIndex] = val;
            } else {
                delete settings[charId][gIndex];
            }
            // 联动：当在侧边栏手动打字修改时，也立刻同步刷新 User 面板的显示！
            updateInjectedPanel();
        });

        row.append(label);
        row.append(input);
        container.append(row);
    });
}

// 6. 初始化
async function initUI() {
    try {
        const htmlFile = await $.get(`${extensionFolderPath}/index.html`);
        $("#extensions_settings").append(htmlFile);
        $("#aps-save-btn").css("white-space", "nowrap");
        $("#aps-save-btn").on("click", () => {
            saveSettingsDebounced();
            toastr.success("开场白人设绑定已保存！"); 
        });
        renderMappingUI();
    } catch (error) {
        console.error(`[${extensionName}] HTML 加载失败:`, error);
    }
}

// 7. 切卡执行逻辑
async function onChatStarted() {
    const context = getContext();
    if (!context.chat || context.chat.length === 0 || context.chat.length > 1) return; 

    const charId = context.characterId;
    if (charId === undefined || !settings[charId]) return;

    const currentGreeting = context.chat[0].mes;
    const currentCore = getCoreText(currentGreeting);
    const gIndex = getCurrentGreetingIndex();

    if (gIndex !== -1 && settings[charId][gIndex]) {
        const targetPersona = settings[charId][gIndex];
        
        toastr.info(`[自动切卡] 检测到开场白 ${gIndex + 1}，准备切换至: ${targetPersona}`);
        
        setTimeout(async () => {
            try {
                const slashModule = await import('/scripts/slash-commands.js');
                const executeSlash = slashModule.executeSlashCommandsWithOptions || slashModule.executeSlashCommands;
                if (executeSlash) {
                    await executeSlash(`/persona "${targetPersona}"`);
                    toastr.success(`✅ 已强制切换人设至: ${targetPersona}`);
                    // 切换完成后，让所有 UI 刷新一次
                    updateInjectedPanel();
                }
            } catch (err) {
                console.error(`[${extensionName}] 命令执行失败:`, err);
            }
        }, 1000); 
    } else {
        // 如果滑到了一个没有绑定的开场白，也要刷新一下注入面板的状态
        updateInjectedPanel();
    }
}

// 8. 挂载探头与事件
jQuery(async () => {
    try {
        await initUI();
        
        // 开启 24 小时 DOM 监控探头
        const uiObserver = new MutationObserver(() => {
            // 一旦原生的“链接”模块出现，并且我们还没注入过，就立刻注入
            if ($(".persona_binding").length > 0 && $("#aps-injected-panel").length === 0) {
                injectIntoPersonaPanel();
            }
        });
        uiObserver.observe(document.body, { childList: true, subtree: true });

        eventSource.on(event_types.CHAT_CHANGED, () => {
            renderMappingUI();
            updateInjectedPanel();
            onChatStarted();
        });
        eventSource.on(event_types.MESSAGE_SWIPED, (index) => {
            if (index === 0) {
                onChatStarted();
                updateInjectedPanel(); // 滑动开场白时实时刷新面板
            }
        });
    } catch (error) {
        console.error(`[${extensionName}] 致命错误:`, error);
    }
});
