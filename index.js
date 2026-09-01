import { getContext, extension_settings } from '/scripts/extensions.js';
import { saveSettingsDebounced, eventSource, event_types } from '/script.js';
import { SlashCommandParser } from '/scripts/slash-commands/SlashCommandParser.js';

const extensionName = "Auto-Persona-Switch-NFL"; 
const extensionFolderPath = `/scripts/extensions/third-party/${extensionName}`;

if (!extension_settings[extensionName]) {
    extension_settings[extensionName] = {};
}
let settings = extension_settings[extensionName];

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
        });

        row.append(label);
        row.append(input);
        container.append(row);
    });
}

async function initUI() {
    try {
        const htmlFile = await $.get(`${extensionFolderPath}/index.html`);
        
        // 【UI 注入位置修改】寻找原生的人设面板绑定区域
        const nativeBindingArea = $(".persona_binding");
        if (nativeBindingArea.length > 0) {
            // 将我们的模块强行插入到原生锁定区域的下方，并加一条分割线
            nativeBindingArea.after(`<div id="aps-injected-wrapper" style="margin-top:15px; border-top: 1px dashed var(--SmartThemeBorderColor); padding-top: 15px;"></div>`);
            $("#aps-injected-wrapper").append(htmlFile);
        } else {
            // 兜底方案
            $("#extensions_settings").append(htmlFile);
        }

        // 顺手修一下你截图里被挤成竖排的按钮
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

async function onChatStarted() {
    const context = getContext();
    if (!context.chat || context.chat.length === 0) return;
    if (context.chat.length > 1) return; 

    const charId = context.characterId;
    if (charId === undefined || !settings[charId]) return;

    const currentGreeting = context.chat[0].mes;
    const currentChar = context.characters[charId];
    if (!currentChar) return;

    const greetings = [];
    if (currentChar.first_mes) greetings.push(currentChar.first_mes);
    if (currentChar.data && currentChar.data.alternate_greetings) {
        greetings.push(...currentChar.data.alternate_greetings);
    }

    let targetIndex = -1;
    
    // 【核心修复 1：宏变量解析】
    for (let i = 0; i < greetings.length; i++) {
        // 预先把原始文本里的宏替换成真实上下文
        let expectedText = greetings[i]
            .replace(/\{\{user\}\}/gi, context.name1)
            .replace(/\{\{char\}\}/gi, context.name2)
            .trim();
        
        // 取前 30 个字符进行匹配，防止后缀乱码导致匹配失败
        const previewLength = Math.min(30, expectedText.length);
        const expectedPreview = expectedText.substring(0, previewLength);
        
        if (currentGreeting.trim().includes(expectedPreview)) {
            targetIndex = i;
            break;
        }
    }

    if (targetIndex !== -1 && settings[charId][targetIndex]) {
        const targetPersona = settings[charId][targetIndex];
        
        // 【核心修复 2：延迟执行，反杀原生系统】
        setTimeout(async () => {
            console.log(`[${extensionName}] 触发开场白绑定，强行切换至: ${targetPersona}`);
            await SlashCommandParser.executeSlash(`/persona "${targetPersona}"`);
            toastr.success(`已根据开场白自动切换至人设: ${targetPersona}`);
        }, 800); 
    }
}

jQuery(async () => {
    try {
        await initUI();
        eventSource.on(event_types.CHAT_CHANGED, () => {
            renderMappingUI();
            onChatStarted();
        });
        eventSource.on(event_types.MESSAGE_SWIPED, (index) => {
            if (index === 0) onChatStarted();
        });
    } catch (error) {
        console.error(`[${extensionName}] 致命错误:`, error);
    }
});
