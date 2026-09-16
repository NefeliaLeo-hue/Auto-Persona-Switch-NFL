import { getContext, extension_settings } from '/scripts/extensions.js';
import { saveSettingsDebounced, eventSource, event_types } from '/script.js';

const extName = "Auto-Persona-Switch-NFL";
if (!extension_settings[extName]) extension_settings[extName] = {};
const settings = extension_settings[extName];

const getName = (data) => typeof data === 'object' && data !== null ? (data.name || "") : (data || "");

// 修复：恢复名字过滤逻辑，识别带有 {{user}} 宏的开场白
const getGreetIdx = () => {
    const ctx = getContext();
    if (!ctx?.chat?.length || ctx.characterId === undefined) return -1;
    const char = ctx.characters[ctx.characterId];
    if (!char) return -1;
    
    const norm = (t) => {
        if (!t) return "";
        let text = t.replace(/\{\{.*?\}\}/g, ''); // 剔除所有宏标记
        if (ctx.name1) text = text.replace(new RegExp(ctx.name1, 'gi'), ''); // 剔除渲染后的 User 真名
        if (ctx.name2) text = text.replace(new RegExp(ctx.name2, 'gi'), ''); // 剔除渲染后的 Char 真名
        text = text.replace(/<[^>]*>?/gm, ''); // 剔除 HTML 标签
        text = text.replace(/[^\w\u4e00-\u9fa5]/g, ''); // 只保留文字和数字
        return text.substring(0, 15);
    };
    
    const cur = norm(ctx.chat[0].mes);
    return [char.first_mes, ...(char.data?.alternate_greetings || [])].findIndex(g => norm(g) === cur);
};

const updateUI = () => {
    const ctx = getContext();
    const charId = ctx?.characterId;
    const sideContainer = $("#aps-mapping-container");
    const botPanel = $("#aps-injected-panel");

    if (sideContainer.length) {
        sideContainer.empty();
        if (charId === undefined) {
            sideContainer.append("<p style='opacity:0.6;'>请选中角色卡。</p>");
        } else {
            if (!settings[charId]) settings[charId] = {};
            const char = ctx.characters[charId];
            const greets = [char.first_mes, ...(char.data?.alternate_greetings || [])];
            
            greets.forEach((g, i) => {
                const val = getName(settings[charId][i]);
                settings[charId][i] = val; 
                sideContainer.append(`
                    <div style="display:flex; align-items:center; gap:10px; margin-bottom:10px;">
                        <span style="flex:1; font-size:0.9em; color:var(--SmartThemeBodyColor);">开场白 ${i+1}: ${g.replace(/\n/g, "").substring(0,15)}...</span>
                        <input type="text" class="text_pole" style="flex:1; cursor:not-allowed;" value="${val}" placeholder="请在 User 面板一键绑定" readonly title="为确保同步，请打开人设(User)面板使用一键绑定功能。">
                    </div>
                `);
            });
        }
    }

    if (botPanel.length) {
        const gIdx = getGreetIdx();
        
        // --- 1. 原版功能：更新当前活跃开场白UI ---
        if (charId === undefined || gIdx === -1) {
            $("#aps-injected-info").html(`<span style="opacity:0.6;">请进入聊天查看当前开场白</span>`);
            $("#aps-bind-btn, #aps-unbind-btn").hide();
        } else {
            const val = getName(settings[charId][gIdx]);
            if (val) {
                $("#aps-injected-info").html(`当前开场白: <b>${gIdx+1}</b><br>已绑定人设: <b style="color:var(--SmartThemeQuoteColor);">${val}</b>`);
                $("#aps-bind-btn").html(`<i class="fa-solid fa-rotate"></i> 更新当前开场白绑定`).show();
                $("#aps-unbind-btn").show();
            } else {
                $("#aps-injected-info").html(`当前开场白: <b>${gIdx+1}</b><br>状态: <b>未绑定</b>`);
                $("#aps-bind-btn").html(`<i class="fa-solid fa-link"></i> 一键绑定当前开场白`).show();
                $("#aps-unbind-btn").hide();
            }
        }

        // --- 2. 新增功能：生成并更新扫描列表UI ---
        const listContainer = $("#aps-greetings-list");
        listContainer.empty();
        
        if (charId === undefined) {
            listContainer.html(`<span style="opacity:0.6;">请进入聊天以扫描开场白</span>`);
        } else {
            const char = ctx.characters[charId];
            const greets = [char.first_mes, ...(char.data?.alternate_greetings || [])];
            
            greets.forEach((g, i) => {
                const val = getName(settings[charId][i]);
                const isCur = (i === gIdx);
                
                const borderStyle = isCur ? "border-left: 3px solid var(--SmartThemeQuoteColor);" : "border-left: 3px solid transparent;";
                const bgStyle = isCur ? "background: rgba(128,128,128,0.15);" : "background: rgba(0,0,0,0.1);";
                // 剔除 HTML 标签后再截取预览，防止图片代码破坏排版
                const cleanText = g ? g.replace(/<[^>]*>?/gm, '').replace(/\n/g, " ") : "";
                const preview = cleanText ? cleanText.substring(0, 16) + "..." : "无可用文本预览";
                
                let btnHtml = "";
                if (val) {
                    btnHtml = `<button class="menu_button danger aps-btn-unbind" data-idx="${i}" style="margin:0; padding:4px 8px; font-size:0.8em; min-width:60px;">解绑</button>`;
                } else {
                    btnHtml = `<button class="menu_button aps-btn-bind" data-idx="${i}" style="margin:0; padding:4px 8px; font-size:0.8em; min-width:60px;">绑定</button>`;
                }

                listContainer.append(`
                    <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:6px; padding: 6px 8px; border-radius: 4px; ${borderStyle} ${bgStyle}">
                        <div style="flex:1; overflow:hidden; padding-right: 10px;">
                            <div style="font-size:0.85em; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="预览: ${preview}">
                                <b>#${i+1}</b> ${preview}
                            </div>
                            <div style="font-size:0.8em; margin-top:4px; opacity:0.8;">
                                ${val ? `已绑: <b style="color:var(--SmartThemeQuoteColor);">${val}</b>` : '状态: 未绑定'}
                                ${isCur ? ' <span style="color:var(--SmartThemeQuoteColor); font-size:0.9em;">(当前)</span>' : ''}
                            </div>
                        </div>
                        <div style="flex-shrink:0;">${btnHtml}</div>
                    </div>
                `);
            });

            // 列表按钮绑定事件
            $(".aps-btn-bind").off("click").on("click", function() {
                const idx = $(this).data("idx");
                if (ctx.name1) {
                    settings[charId][idx] = ctx.name1;
                    saveSettingsDebounced();
                    toastr.success(`✅ 已将开场白 #${idx+1} 绑定至当前人设: ${ctx.name1}`);
                    updateUI(); 
                } else {
                    toastr.error("未能获取当前人设名称！");
                }
            });

            $(".aps-btn-unbind").off("click").on("click", function() {
                const idx = $(this).data("idx");
                delete settings[charId][idx];
                saveSettingsDebounced();
                toastr.info(`已解除开场白 #${idx+1} 的绑定`);
                updateUI(); 
            });
        }
    }
};

const injectBottom = () => {
    if ($("#aps-injected-panel").length) return;
    const pm = $("#PersonaManagement");
    if (!pm.is(":visible")) return;

    const target = pm.find(".inline-drawer-toggle:contains('全局'), .inline-drawer-toggle:contains('Global')").closest(".inline-drawer");
    const html = `
    <div id="aps-injected-panel" style="margin: 15px 0; padding: 12px; border: 1px dashed var(--SmartThemeQuoteColor); border-radius: 8px; background: rgba(0,0,0,0.1);">
        <div style="font-weight: bold; margin-bottom: 8px; color: var(--SmartThemeQuoteColor);">
            <i class="fa-solid fa-masks-theater"></i> 开场白人设绑定 (联动)
        </div>
        
        <!-- 1. 原版：精确绑定当前聊天中的开场白 -->
        <div id="aps-injected-info" style="font-size: 0.9em; margin-bottom: 10px;"></div>
        <div style="display:flex; gap: 8px; margin-bottom: 12px;">
            <button id="aps-bind-btn" class="menu_button" style="flex:1; margin:0;"></button>
            <button id="aps-unbind-btn" class="menu_button danger" style="flex:1; margin:0;"><i class="fa-solid fa-unlink"></i> 解除</button>
        </div>

        <hr style="border-color: var(--SmartThemeQuoteColor); opacity: 0.2; margin: 12px 0;">

        <!-- 2. 新增：扫描列表功能 -->
        <div style="font-size: 0.85em; margin-bottom: 8px; opacity: 0.8;">
            <i class="fa-solid fa-list-check"></i> 快速扫描列表 <span style="font-size: 0.85em; opacity: 0.7;">(若预览乱码请用上方功能)</span>
        </div>
        <div id="aps-greetings-list" style="display:flex; flex-direction:column; max-height:200px; overflow-y:auto; padding-right:5px;">
            <!-- 列表由 updateUI 动态填充 -->
        </div>
    </div>`;

    if (target.length) target.before(html); else pm.append(html);

    // 绑定原版主按钮事件
    $("#aps-bind-btn").on("click", () => {
        const ctx = getContext();
        if (ctx.characterId !== undefined && getGreetIdx() !== -1 && ctx.name1) {
            settings[ctx.characterId][getGreetIdx()] = ctx.name1; 
            saveSettingsDebounced();
            toastr.success(`✅ 已绑定至人设: ${ctx.name1}`);
            updateUI();
        }
    });

    $("#aps-unbind-btn").on("click", () => {
        const ctx = getContext();
        if (ctx.characterId !== undefined && getGreetIdx() !== -1 && settings[ctx.characterId]) {
            delete settings[ctx.characterId][getGreetIdx()];
            saveSettingsDebounced();
            toastr.info(`已解除当前开场白的绑定`);
            updateUI();
        }
    });

    updateUI();
};

const askToSwitchPersona = (targetName, currentName) => {
    if ($("#aps-confirm-modal").length > 0) return; 

    const modalHtml = `
    <div id="aps-confirm-modal" style="position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.6); z-index: 99999; display: flex; justify-content: center; align-items: center;">
        <div style="background: var(--SmartThemeBlurTintColor); border: 1px solid var(--SmartThemeQuoteColor); padding: 25px; border-radius: 12px; text-align: center; max-width: 85%; box-shadow: 0 10px 30px rgba(0,0,0,0.7); backdrop-filter: blur(5px);">
            <h3 style="margin-top:0; color: var(--SmartThemeBodyColor); display: flex; align-items: center; justify-content: center; gap: 8px;">
                <i class="fa-solid fa-triangle-exclamation" style="color: #ff9800;"></i> 发现不同的人设配置
            </h3>
            <div style="color: var(--SmartThemeBodyColor); text-align: left; margin: 15px 0; font-size: 0.95em; line-height: 1.5;">
                此开场白绑定的目标人设为：<b style="color: var(--SmartThemeQuoteColor);">${targetName}</b><br>
                当前正在使用的人设为：<b>${currentName}</b>
            </div>
            <p style="color: var(--SmartThemeBodyColor); font-size: 0.8em; opacity: 0.7; text-align: left; margin-bottom: 20px;">
                ⚠️ <b>防冲突提示</b>：如果该char本身已经与user绑定，且该user与绑定开场白的user是两个不同的设定，建议点击“取消切换”，将user与char本身解绑，防止发生覆写冲突导致聊天记录丢失！
            </p>
            <div style="display: flex; gap: 10px; justify-content: center;">
                <button id="aps-btn-no" class="menu_button danger" style="margin:0; flex:1;">取消切换</button>
                <button id="aps-btn-yes" class="menu_button" style="margin:0; flex:1;">强制切换</button>
            </div>
        </div>
    </div>
    `;
    
    $("body").append(modalHtml);

    $("#aps-btn-no").on("click", () => {
        $("#aps-confirm-modal").remove();
        toastr.info("已放弃跳转，保留当前人设。");
    });

    $("#aps-btn-yes").on("click", async () => {
        $("#aps-confirm-modal").remove();
        try {
            const slash = await import('/scripts/slash-commands.js');
            const exec = slash.executeSlashCommandsWithOptions || slash.executeSlashCommands;
            if (exec) {
                await exec(`/persona "${targetName}"`);
                toastr.success(`✅ 已切换至人设: ${targetName}`);
                updateUI();
            }
        } catch (err) {
            console.error("切换失败", err);
        }
    });
};

const handleSwitch = async () => {
    updateUI();
    const ctx = getContext();
    if (!ctx.chat || ctx.chat.length !== 1) return; 
    
    const charId = ctx.characterId;
    const gIdx = getGreetIdx();
    
    if (charId !== undefined && gIdx !== -1 && settings[charId]) {
        const target = getName(settings[charId][gIdx]);
        
        if (target && ctx.name1 !== target) {
            askToSwitchPersona(target, ctx.name1);
        }
    }
};

jQuery(async () => {
    const htmlFile = await $.get(`/scripts/extensions/third-party/${extName}/index.html`);
    const timer = setInterval(() => {
        if ($("#extensions_settings").length && !$("#aps-extension-settings").length) {
            $("#extensions_settings").append(htmlFile);
            
            // 修复2：加回防止按钮文本换行的 CSS
            $("#aps-save-btn").css("white-space", "nowrap").on("click", () => { 
                saveSettingsDebounced(); 
                toastr.success("已保存！"); 
            });
            
            updateUI();
            clearInterval(timer);
        }
    }, 500);

    setInterval(() => { if ($("#PersonaManagement").is(":visible")) injectBottom(); }, 500);

    eventSource.on(event_types.CHAT_CHANGED, handleSwitch);
    eventSource.on(event_types.MESSAGE_SWIPED, (idx) => { if (idx === 0) handleSwitch(); });
});
