import { extension_settings, getContext } from "../../../extensions.js";
import { saveSettingsDebounced } from "../../../../script.js";
import { eventSource, event_types } from "../../../../script.js";
import { SlashCommandParser } from "../../../slash-commands/SlashCommandParser.js";
// 引入 ST 内置的用户档案获取函数
import { user_avatars } from "../../../extensions.js"; 

const extensionName = "AutoPersonaSwitch";
const extensionFolderPath = `ThirdParty/${extensionName}`;

// 确保我们的设置对象存在
if (!extension_settings[extensionName]) {
    extension_settings[extensionName] = {};
}
let settings = extension_settings[extensionName];

// --- 1. UI 渲染部分 ---

// 动态渲染绑定菜单
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

    // 获取当前角色的所有开场白 (ST 数据结构)
    const greetings = [];
    if (currentChar.first_mes) {
        greetings.push(currentChar.first_mes); // 第 0 个总是默认开场白
    }
    if (currentChar.data && currentChar.data.alternate_greetings) {
        greetings.push(...currentChar.data.alternate_greetings);
    }

    if (greetings.length === 0) {
         container.append("<p>该角色没有开场白。</p>");
         return;
    }

    // 获取系统里的所有 User 人设
    // ST 中 user_avatars 存储了所有角色，如果没有则提供一个默认的 "User"
    let personas = ["User"]; 
    if (Array.isArray(user_avatars) && user_avatars.length > 0) {
        personas = user_avatars;
    }

    // 初始化当前角色的设置对象
    if (!settings[charId]) {
        settings[charId] = {};
    }

    // 为每个开场白生成一行绑定 UI
    greetings.forEach((greetingText, index) => {
        // 截取前 20 个字作为预览
        const preview = greetingText.replace(/\n/g, " ").substring(0, 20) + "...";
        
        // 创建一个包裹容器
        const row = $(`<div class="aps-mapping-row" style="margin-bottom: 10px; display: flex; align-items: center; gap: 10px;"></div>`);
        
        // 开场白预览标签
        const label = $(`<span style="flex: 1; font-size: 0.9em; color: var(--SmartThemeBodyColor);">开场白 ${index + 1}: ${preview}</span>`);
        
        // 生成下拉菜单
        const select = $(`<select class="text_pole" data-index="${index}" style="flex: 1;"></select>`);
        select.append(`<option value="">(不切换)</option>`);
        
        personas.forEach(persona => {
            const isSelected = settings[charId][index] === persona ? "selected" : "";
            select.append(`<option value="${persona}" ${isSelected}>${persona}</option>`);
        });

        // 监听下拉菜单改变，保存数据
        select.on("change", function() {
            const selectedPersona = $(this).val();
            const gIndex = $(this).data("index");
            
            if (selectedPersona) {
                settings[charId][gIndex] = selectedPersona;
            } else {
                delete settings[charId][gIndex]; // 如果选了不切换，就删掉这条记录
            }
        });

        row.append(label);
        row.append(select);
        container.append(row);
    });
}


async function initUI() {
    const htmlFile = await $.get(`${extensionFolderPath}/index.html`);
    $("#extensions_settings").append(htmlFile);

    // 当用户点击保存按钮时，调用 ST 的保存接口
    $("#aps-save-btn").on("click", () => {
        saveSettingsDebounced();
        toastr.success("自动切卡设置已保存！"); 
    });

    // 初始渲染一次
    renderMappingUI();
}

// --- 2. 核心逻辑部分 ---

async function onChatStarted() {
    const context = getContext();
    // 只有在开局第一句话时触发
    if (!context.chat || context.chat.length === 0) return;
    if (context.chat.length > 1) return; 

    const charId = context.characterId;
    if (charId === undefined || !settings[charId]) return;

    // 获取当前聊天第一句话
    const currentGreeting = context.chat[0].mes;
    const currentChar = context.characters[charId];
    if (!currentChar) return;

    // 为了找到当前用的是第几个开场白，我们需要去比对全文
    const greetings = [];
    if (currentChar.first_mes) greetings.push(currentChar.first_mes);
    if (currentChar.data && currentChar.data.alternate_greetings) {
        greetings.push(...currentChar.data.alternate_greetings);
    }

    let targetIndex = -1;
    // 精确比对，找出目前在使用的是哪个开场白
    for (let i = 0; i < greetings.length; i++) {
        // 去除多余空格进行比对，增加容错率
        if (greetings[i].trim() === currentGreeting.trim()) {
            targetIndex = i;
            break;
        }
    }

    if (targetIndex !== -1 && settings[charId][targetIndex]) {
        const targetPersona = settings[charId][targetIndex];
        console.log(`[AutoPersonaSwitch] 匹配到开场白索引: ${targetIndex}, 准备切换人设至: ${targetPersona}`);
        // 关键：静默执行人设切换
        await SlashCommandParser.executeSlash(`/persona "${targetPersona}"`);
        toastr.success(`已自动切换至人设: ${targetPersona}`);
    }
}

// --- 3. 事件挂载部分 ---

jQuery(async () => {
    await initUI();
    
    // 监听：换卡、聊天新建都会触发 CHAT_CHANGED
    eventSource.on(event_types.CHAT_CHANGED, () => {
        // 每次换卡，重新渲染一遍 UI 面板
        renderMappingUI();
        // 尝试执行切卡逻辑
        onChatStarted();
    });

    // 监听：在第一条消息上左右滑动换开场白
    eventSource.on(event_types.MESSAGE_SWIPED, (index) => {
        if (index === 0) {
            onChatStarted();
        }
    });
});
