import { getContext, extension_settings } from '/scripts/extensions.js';
import { saveSettingsDebounced, eventSource, event_types } from '/script.js';
import { SlashCommandParser } from '/scripts/slash-commands/SlashCommandParser.js';

const extensionName = "Auto-Persona-Switch-NFL"; 
const extensionFolderPath = `/scripts/extensions/third-party/${extensionName}`;

if (!extension_settings[extensionName]) {
    extension_settings[extensionName] = {};
}
let settings = extension_settings[extensionName];

// --- 新增：硬核纯文本提取器，彻底粉碎所有匹配障碍 ---
function getCoreText(text) {
    if (!text) return "";
    let t = text.replace(/\{\{.*?\}\}/g, ''); // 删掉所有 {{xxx}} 宏变量
    const ctx = getContext();
    if (ctx.name1) t = t.replace(new RegExp(ctx.name1, 'gi'), ''); // 删掉你的真名
    if (ctx.name2) t = t.replace(new RegExp(ctx.name2, 'gi'), ''); // 删掉角色真名
    
    // 暴力删除所有标点、空格、特殊符号、HTML标签，只保留最纯粹的汉字和字母数字
    t = t.replace(/<[^>]*>?/gm, ''); 
    t = t.replace(/[^\w\u4e00-\u9fa5]/g, ''); 
    return t.substring(0, 15); // 只取前 15 个纯字符作为“指纹”
}

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
        // 回退到最稳妥的扩展面板，确保你绝对能看到它
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

async function onChatStarted() {
    const context = getContext();
    if (!context.chat || context.chat.length === 0) return;
    if (context.chat.length > 1) return; // 确保只在聊天第一句话触发

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

    // 提取当前屏幕上这句话的核心指纹
    const currentCore = getCoreText(currentGreeting);
    let targetIndex = -1;
    
    // 用指纹去比对每一个开场白的指纹
    for (let i = 0; i < greetings.length; i++) {
        const expectCore = getCoreText(greetings[i]);
        if (currentCore !== "" && expectCore !== "" && currentCore === expectCore) {
            targetIndex = i;
            break;
        }
    }

    if (targetIndex !== -1 && settings[charId][targetIndex]) {
        const targetPersona = settings[charId][targetIndex];
        
        // 弹出蓝色提示：告诉你匹配成功了，正在等原生系统的霸权结束
        toastr.info(`[自动切卡] 检测到开场白 ${targetIndex + 1}，准备切换至: ${targetPersona}`);
        
        // 延迟 1 秒后反杀，并弹出绿色成功提示
        setTimeout(async () => {
            await SlashCommandParser.executeSlash(`/persona "${targetPersona}"`);
            toastr.success(`✅ 已强制切换人设至: ${targetPersona}`);
        }, 1000); 
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
