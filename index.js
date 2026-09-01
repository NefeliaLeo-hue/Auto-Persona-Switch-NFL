// 1. 调用 ST 官方公共 API 接口 (使用绝对路径)
import { getContext, extension_settings } from '/scripts/extensions.js';
import { saveSettingsDebounced, eventSource, event_types } from '/script.js';
import { SlashCommandParser } from '/scripts/slash-commands/SlashCommandParser.js';

// 2. 匹配仓库
const extensionName = "Auto-Persona-Switch-NFL"; 
const extensionFolderPath = `/scripts/extensions/third-party/${extensionName}`;

// 3. 我们原创的设置档初始化逻辑
if (!extension_settings[extensionName]) {
    extension_settings[extensionName] = {};
}
let settings = extension_settings[extensionName];

// 4.  UI 渲染函数
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

    // 抓取角色的开场白
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

    // 动态生成精简版输入框 UI
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

// 5. 初始化加载
async function initUI() {
    try {
        // 读取我们自己的 HTML 文件
        const htmlFile = await $.get(`${extensionFolderPath}/index.html`);
        $("#extensions_settings").append(htmlFile);

        $("#aps-save-btn").on("click", () => {
            saveSettingsDebounced();
            toastr.success("自动切卡设置已保存！"); 
        });

        renderMappingUI();
    } catch (error) {
        console.error(`[${extensionName}] HTML 加载失败，检查路径:`, error);
    }
}

// 6. 核心触发逻辑
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
    for (let i = 0; i < greetings.length; i++) {
        if (greetings[i].trim() === currentGreeting.trim()) {
            targetIndex = i;
            break;
        }
    }

    if (targetIndex !== -1 && settings[charId][targetIndex]) {
        const targetPersona = settings[charId][targetIndex];
        console.log(`[${extensionName}] 准备切换至: ${targetPersona}`);
        await SlashCommandParser.executeSlash(`/persona "${targetPersona}"`);
        toastr.success(`已自动切换至人设: ${targetPersona}`);
    }
}

// 7. 挂载事件监听
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
