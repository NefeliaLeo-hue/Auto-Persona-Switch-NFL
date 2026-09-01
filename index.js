import { getContext, extension_settings } from '/scripts/extensions.js';
import { saveSettingsDebounced, eventSource, event_types } from '/script.js';

const extensionName = "Auto-Persona-Switch-NFL"; 
const extensionFolderPath = `/scripts/extensions/third-party/${extensionName}`;

if (!extension_settings[extensionName]) {
    extension_settings[extensionName] = {};
}
let settings = extension_settings[extensionName];

// 硬核纯文本提取器：提取指纹
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

    const currentCore = getCoreText(currentGreeting);
    let targetIndex = -1;
    
    for (let i = 0; i < greetings.length; i++) {
        const expectCore = getCoreText(greetings[i]);
        if (currentCore !== "" && expectCore !== "" && currentCore === expectCore) {
            targetIndex = i;
            break;
        }
    }

    if (targetIndex !== -1 && settings[charId][targetIndex]) {
        const targetPersona = settings[charId][targetIndex];
        
        toastr.info(`[自动切卡] 检测到开场白 ${targetIndex + 1}，准备切换至: ${targetPersona}`);
        
        // --- 核心修复：使用动态引入的方式执行斜杠命令，彻底解决崩溃问题 ---
        setTimeout(async () => {
            try {
                // 动态加载 ST 最新架构的 slash-commands 模块 (参考了 Horae 的做法)
                const slashModule = await import('/scripts/slash-commands.js');
                // 兼容不同版本的执行函数
                const executeSlash = slashModule.executeSlashCommandsWithOptions || slashModule.executeSlashCommands;
                
                if (executeSlash) {
                    await executeSlash(`/persona "${targetPersona}"`);
                    toastr.success(`✅ 已强制切换人设至: ${targetPersona}`);
                } else {
                    console.error(`[${extensionName}] 找不到执行命令的函数。`);
                }
            } catch (err) {
                console.error(`[${extensionName}] 命令执行失败:`, err);
            }
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
