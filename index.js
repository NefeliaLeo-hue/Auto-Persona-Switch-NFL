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
        $("#extensions_settings").append(htmlFile);

        $("#aps-save-btn").on("click", () => {
            saveSettingsDebounced();
            toastr.success("自动切卡设置已保存！"); 
        });

        renderMappingUI();
    } catch (error) {
        console.error(`[${extensionName}] HTML 加载失败:`, error);
    }
}

async function onChatStarted() {
    const context = getContext();
    if (!context.chat || context.chat.length === 0) return;
    if (context.chat.length > 1) return; // 确保只在聊天第一句话时触发

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
    
    // 终极模糊匹配：按宏变量（如 {{user}}）切分文本，逐段比对，完美绕过替换后的名字差异
    for (let i = 0; i < greetings.length; i++) {
        const parts = greetings[i].split(/\{\{.*?\}\}/);
        let match = true;
        let searchPos = 0;
        
        for (const part of parts) {
            const p = part.trim();
            if (!p) continue;
            const foundIdx = currentGreeting.indexOf(p, searchPos);
            if (foundIdx === -1) {
                match = false;
                break;
            }
            searchPos = foundIdx + p.length;
        }

        if (match) {
            targetIndex = i;
            break;
        }
    }

    if (targetIndex !== -1 && settings[charId][targetIndex]) {
        const targetPersona = settings[charId][targetIndex];
        console.log(`[${extensionName}] 匹配成功，准备切换至: ${targetPersona}`);
        await SlashCommandParser.executeSlash(`/persona "${targetPersona}"`);
        toastr.success(`已自动切换至人设: ${targetPersona}`);
    }
}

jQuery(async () => {
    try {
        await initUI();
        eventSource.on(event_types.CHAT_CHANGED, () => {
            renderMappingUI();
            onChatStarted(); // 新聊天载入时触发
        });
        eventSource.on(event_types.MESSAGE_SWIPED, (index) => {
            if (index === 0) onChatStarted(); // 在第一句话滑动时触发
        });
    } catch (error) {
        console.error(`[${extensionName}] 致命错误:`, error);
    }
});
