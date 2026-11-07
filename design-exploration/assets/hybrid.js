/* 第11套融合原型：沿用共享Mock与业务抽屉，只改变页面组合及本地视图操作。 */
(() => {
  let context;
  window.renderHybrid = helpers => {
    context = helpers;
    const {d,state,brand,nav,account,icon,fmt,revenue,kpi,panel,graphPanel,sales,orderTable} = helpers;
    const m = state.scope ? d.windows.find(w => w.id === state.scope) : d.summary;
    const scopeSales = d.sales.filter(s => !state.scope || s.windowId === state.scope);
    const lowStock = scopeSales.filter(s => s.stock < 10).length;
    const unread = d.feedback.filter(f => (!state.scope || f.windowId === state.scope) && !f.reply).length;
    const firstDish = [...scopeSales].sort((a,b) => b.value-a.value)[0];
    document.body.classList.toggle('hybrid-focus', !!state.focus);
    const range = `<label class="hybrid-range">管理范围<select aria-label="管理范围" data-scope><option value="0" ${!state.scope?'selected':''}>全校食堂</option>${d.windows.map(w=>`<option value="${w.id}" ${state.scope===w.id?'selected':''}>${w.canteenName} · ${w.name}</option>`).join('')}</select></label>`;
    const stage = [['pending','待接单',2],['preparing','备餐中',3],['ready','待取餐',4]];
    const queues = `<div class="hybrid-stages">${stage.map(([key,label,status])=>`<button data-status="${status}"><span><i class="status-dot s${status}"></i>${label}</span><strong>${fmt(m[key])}</strong><small>${status===2?'等待窗口接单':status===3?'正在准备餐食':'等待学生取餐'}</small></button>`).join('')}</div><div class="hybrid-queue-foot"><span>${m.pending+m.preparing+m.ready} 笔预约正在处理中</span><button data-nav="orders">查看全部 ${icon('arrow',14)}</button></div>`;
    const attention = `<div class="hybrid-attention"><button data-nav="menu"><span class="hybrid-attention-icon">${icon('dish',16)}</span><span><b>${lowStock} 道低库存</b><small>可售余量小于 10 份</small></span>${icon('arrow',13)}</button><button data-nav="feedback"><span class="hybrid-attention-icon">${icon('chat',16)}</span><span><b>${unread} 条待回复反馈</b><small>查看学生的就餐建议</small></span>${icon('arrow',13)}</button></div>`;
    return `<header class="hybrid-header">${brand()}${nav('horizontal')}<div class="utilities"><button class="screen-link" data-nav="screen">${icon('screen',17)}<span>运营数据大屏</span>${icon('expand',12)}</button>${account()}</div></header>
      <main class="hybrid-main"><header class="hybrid-heading"><div><p class="hybrid-breadcrumb">全校运营 <span>/</span> 经营概览</p><h1>经营概览<span class="hybrid-day">周四，11 月 5 日</span></h1><p>看清经营，也照顾好每一份等待。</p></div><div class="hybrid-heading-right"><span class="hybrid-sample">Mock · 设计预览</span>${range}</div></header>
      <div class="hybrid-bento">
        <section class="hybrid-revenue"><span class="hybrid-card-index">REVENUE / 核销收入</span>${revenue()}<div class="hybrid-revenue-foot"><span>${icon('check',14)} 完成取餐后计入</span><span>¥ CNY</span></div></section>
        ${panel('每一份预约，都有下一步','订单处理',queues,'hybrid-queue')}
        <section class="hybrid-summary">${kpi('今日预约','todayOrders','当前管理范围 · 当日预约笔数')}<div class="hybrid-completed"><span>累计核销订单</span><b>${fmt(m.completed)} <small>笔</small></b></div></section>
        ${graphPanel('area')}
        ${panel('好味道，值得再来','菜品经营 · 核销销量',`<button class="hybrid-featured" data-dish="${firstDish.id}"><img src="../assets/${firstDish.image}.jpg" alt="${firstDish.name}"/><span class="hybrid-featured-label">本期人气 No.1</span><span class="hybrid-featured-caption"><b>${firstDish.name}</b><span>${firstDish.value} 份核销 ${icon('arrow',14)}</span></span></button>${sales(true)}<button class="hybrid-menu-link" data-nav="menu">管理菜品与库存 ${icon('arrow',15)}</button>`,'hybrid-popular')}
        ${panel('近期预约','当前范围 · 取餐时间顺序',orderTable(),'hybrid-orders',`<button class="text-btn" data-nav="orders">全部预约 ${icon('arrow',14)}</button>`)}
        <section class="hybrid-followup"><span class="hybrid-followup-title">经营关注</span>${attention}</section>
      </div><p class="hybrid-footnote">收入按已完成取餐订单统计。今日预约、累计核销与当前队列采用不同时间口径。</p></main>
      <footer class="hybrid-toolbar-zone"><div class="hybrid-toolbar" role="toolbar" aria-label="概览常用工具"><button class="hybrid-tool-search" data-action="search" title="查找工作，快捷键 /">${icon('search',18)}<span>查找工作</span><kbd>/</kbd></button><span class="hybrid-tool-divider"></span><button class="hybrid-tool-primary" data-status="2">${icon('orders',17)}<span>处理待接单</span><b>${m.pending}</b></button><button data-action="export">${icon('arrow',17)}<span>导出概览</span></button><button data-hybrid="refresh">${icon('clock',17)}<span>刷新视图</span></button><span class="hybrid-tool-divider"></span><button data-hybrid="focus" aria-pressed="${!!state.focus}">${icon('expand',17)}<span>${state.focus?'退出专注':'专注模式'}</span></button></div><a class="hybrid-back" href="../index.html">方案 11 · 返回设计画廊 ${icon('arrow',12)}</a></footer>`;
  };
  // 工具栏只重绘当前样本或切换本地专注视图，不请求后端、不改变真实订单。
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-hybrid]');
    if (!button || !context) return;
    if (button.dataset.hybrid === 'focus') {
      context.state.focus = !context.state.focus;
      context.render();
      document.querySelector('[data-hybrid="focus"]')?.focus({preventScroll:true});
    } else if (button.dataset.hybrid === 'refresh') {
      const top = document.querySelector('.hybrid-main').scrollTop;
      context.render();
      document.querySelector('.hybrid-main').scrollTop = top;
      context.toast('当前示例视图已刷新');
    }
  });
})();
