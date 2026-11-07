"""生成独立设计画廊与页面外壳；不读取账号配置、不连接业务服务。"""
import json
import shutil
from html import escape as h
from pathlib import Path

ROOT = Path(__file__).resolve().parent
concepts = json.loads((ROOT / 'concepts.json').read_text(encoding='utf-8-sig'))
refs = json.loads((ROOT / 'research-sources.json').read_text(encoding='utf-8-sig'))
access = {x['id']: x for x in json.loads((ROOT / 'research/access-results.json').read_text(encoding='utf-8-sig'))}
observations = json.loads((ROOT / 'research/observations.json').read_text(encoding='utf-8-sig'))
for name in ['prototypes', 'screenshots', 'qa']:
    (ROOT / name).mkdir(exist_ok=True)
for filename in ['chicken', 'salad', 'noodles', 'beef', 'orange', 'soup']:
    shutil.copyfile(ROOT.parent / f'web/public/images/{filename}.jpg', ROOT / f'assets/{filename}.jpg')
(ROOT / 'assets/concepts.js').write_text('window.CONCEPTS = ' + json.dumps(concepts, ensure_ascii=False) + ';\nwindow.REFERENCES = ' + json.dumps(refs, ensure_ascii=False) + ';\n', encoding='utf-8')

for c in concepts:
    hybrid_style = '<link rel="stylesheet" href="../assets/hybrid.css">' if c['id'] == '11' else ''
    hybrid_script = '<script src="../assets/hybrid.js"></script>' if c['id'] == '11' else ''
    (ROOT / f'prototypes/{c["id"]}-{c["slug"]}.html').write_text(f'''<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="{'dark' if c['id']=='06' else 'light'}"><title>{h(c['name'])}</title><link rel="stylesheet" href="../assets/prototype.css">{hybrid_style}</head>
<body class="s{c['id']}" data-scheme="{c['id']}"><div id="app"></div><dialog id="drawer" class="drawer" aria-labelledby="drawer-title"></dialog><div id="toast" class="toast" role="status" aria-live="polite"></div><div class="prototype-label"><a href="../index.html">← 方案 {c['id']} · {h(c['tag'])}</a><span>交互原型 · Mock 数据 · 未连接后端</span></div><script src="../assets/concepts.js"></script><script src="../assets/data.js"></script>{hybrid_script}<script src="../assets/prototype.js"></script></body></html>''', encoding='utf-8')

head = '''<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>禾序 · 管理后台设计探索</title><link rel="stylesheet" href="assets/gallery.css"></head><body>'''
(ROOT / 'index.html').write_text(head + '''
<header class="gallery-nav"><a class="gallery-brand" href="index.html"><span>禾</span>禾序 <small>DESIGN STUDY / 2026</small></a><nav><a href="#collection">设计方案</a><a href="research.html">真实案例研究 ↗</a><a href="project-analysis.md">项目分析</a></nav><span class="phase">探索阶段 01—04</span></header>
<main><section class="gallery-hero"><div><p class="kicker">HEXU CANTEEN / PRODUCT DESIGN EXPLORATION</p><h1>十种探索，<br>一个融合方向。</h1><p class="hero-copy">从现场接单到经营决策，为禾序寻找适合日常工作的界面。<br>10 套初始探索，新增第 11 套：顶部导航 + Bento Grid + 浮动工具栏。</p><div class="hero-actions"><a class="gallery-primary" href="#collection">浏览 11 套原型 <span>↓</span></a><a href="research.html">查看研究依据 ↗</a></div></div><aside class="hero-summary"><span>RESEARCH → STRUCTURE → PROTOTYPE</span><div><strong>20</strong><p>已查看真实产品<br>公开界面预览</p></div><div><strong>11</strong><p>不同布局与导航<br>独立首页原型</p></div><small>另有 18 条受限作品链接，均标注访问情况。<br>仅供设计选择，现有后台与接口保持原样。</small></aside></section>
<section class="shared-data"><span>统一比较基线 <b>Mock</b></span><p>累计核销收入 <strong>¥18,624</strong></p><p>今日预约 <strong>186</strong></p><p>待接单 <strong>18</strong></p><p>备餐中 <strong>32</strong></p><p>待取餐 <strong>14</strong></p><a href="data-notes.md">数据口径 ↗</a></section>
<section class="hybrid-gallery-callout"><div><span>NEW / 11</span><h2>顶部导航 + Bento Grid + 浮动工具栏</h2><p>模块切换在顶部，经营重点在画布，常用动作在手边。工具栏独立留出空间。</p></div><a href="prototypes/11-studio.html" target="_blank" rel="noopener">打开融合原型 ↗</a></section><section class="collection" id="collection"><div class="collection-heading"><div><p class="kicker">THE COLLECTION</p><h2>选择适合你的工作方式</h2></div><div class="gallery-filters" aria-label="方案类型"><button class="selected" data-filter="全部">全部 11</button><button data-filter="经营分析">经营分析 3</button><button data-filter="现场运营">现场运营 5</button><button data-filter="探索方向">探索方向 2</button><button data-filter="融合方案">融合方案 1</button></div></div><p class="collection-note">先看布局与工作重点，再进入原型体验。可勾选任意两套进行并排比较。</p><div id="gallery-grid" class="gallery-grid"></div><p id="gallery-count" class="collection-note" aria-live="polite"></p></section>
<section class="selection-guide"><div><p class="kicker">HOW TO CHOOSE</p><h2>先选工作重心，<br>再选视觉气质。</h2></div><div><p><b>新融合方向</b>11 Studio：采用顶部业务导航、Bento 经营画布和动作工具栏，沿用同一份 Mock。</p><p><b>综合经营管理</b>先看 01 Grove：保持熟悉的侧栏，收入、待办和趋势的权重清楚。</p><p><b>餐饮品牌质感</b>看 03 Ledger 和 10 Pantry：前者偏经营手记，后者把菜品与台账放在一起。</p><p><b>午餐高峰处理</b>看 02 Service、07 Campus、08 Tempo：分别以订单状态、窗口负载和取餐时段组织工作。</p><small>你可以选择一个编号，也可以指定两套融合。得到明确确认后，才会提取设计规范并改造现有 Vue 后台。</small></div></section>
</main><footer class="gallery-footer"><span>禾序食堂 · 独立设计探索</span><a href="README.md">打开与交互说明</a><a href="qa/verification.json">浏览器验收记录</a><span>无后端接入 · 未进入正式开发</span></footer>
<div class="compare-tray" id="compare-tray" hidden><span id="compare-caption"></span><button id="compare-open">并排比较</button><button id="compare-clear">清空</button></div><dialog class="compare-dialog" id="compare-dialog"><header><strong>方案比较 · 同一业务数据</strong><button id="compare-close" aria-label="关闭比较">关闭 ×</button></header><div id="compare-content"></div></dialog><script src="assets/concepts.js"></script><script src="assets/gallery.js"></script></body></html>''', encoding='utf-8')

labels = {'layout':'布局','navigation':'导航','color':'配色','type':'字体层级','spacing':'间距','charts':'图表','interaction':'可见交互入口'}
case_blocks = []
for o in observations['cases']:
    r = next(x for x in refs if x['id'] == o['id'])
    case_blocks.append(f'''<article class="research-case" id="{o['id']}"><header><span>{o['id']} / VISUAL REVIEW</span><h2>{h(r['title'])}</h2><a href="{h(r['url'])}" target="_blank" rel="noopener noreferrer">SaaSFrame 公开收录页 ↗</a></header><a href="research/{o['id']}-visual.jpg" target="_blank"><img src="research/{o['id']}-visual.jpg" alt="{h(r['title'])} 公开预览截屏" loading="lazy"></a><dl>{''.join(f'<dt>{label}</dt><dd>{h(o[key])}</dd>' for key,label in labels.items())}</dl><p class="source-note">视觉观察；未登录原产品、未验证实际动画。来源 {h(r['author'])}，截取时间见访问记录。</p></article>''')
restricted = ''.join(f'<tr id="{r["id"]}"><td>{r["id"]}</td><td><a href="{h(r["url"])}" target="_blank" rel="noopener noreferrer">{h(r["title"])}</a><small>{h(r["author"])}</small></td><td>{h(access[r["id"]]["access"])}</td><td>仅题材/作者索引，未作视觉依据</td></tr>' for r in refs[:18])
(ROOT / 'research.html').write_text(head.replace('禾序 · 管理后台设计探索','真实案例研究 · 禾序') + '''
<header class="gallery-nav"><a class="gallery-brand" href="index.html"><span>禾</span>禾序 <small>RESEARCH</small></a><nav><a href="index.html">← 返回设计画廊</a><a href="research/access-results.json">原始访问记录</a></nav></header><main class="research-main"><p class="kicker">DESIGN RESEARCH / 2026.11.05</p><h1>让参考有出处，<br>让选择有依据。</h1><p class="research-intro">收集 38 个具名案例链接，其中 20 个完成公开产品界面的视觉观察，18 个因访问限制仅保留索引。下方每项分析均对应可打开的原始收录页与本地证据。</p>
<section class="research-limits"><h2>访问范围与研究边界</h2><p>优先检索 Modern SaaS Dashboard、Bento Grid、Minimal Admin、AI Workspace、Floating Navigation。Dribbble 浏览器返回空白 202，部分文字可被搜索索引读取；所选 Behance 页面返回 403；Figma Community 受 robots 限制。SaaSFrame 有 20 个独立页面公开预览可见，未访问付费 Figma 文件或产品完整流程。SaaS UI Design 的首页/分类可访问，但未把未查看的产品流程计入案例。Mobbin 公开首页可达，完整流程需登录，未计入视觉研究。</p><p>字体只描述视觉类别，不声称知道付费产品的精确字库、字号或 Token。可见按钮并不证明交互已被实测。原型中的微交互是本项目独立设计。</p><div class="site-links"><a href="https://dribbble.com">Dribbble ↗</a><a href="https://www.behance.net">Behance ↗</a><a href="https://www.saasframe.io">SaaSFrame ↗</a><a href="https://www.saasui.design">SaaS UI Design ↗</a><a href="https://mobbin.com">Mobbin ↗</a><a href="https://www.figma.com/community">Figma Community ↗</a></div></section>
<section class="principles"><h2>提炼成禾序的 8 条原则</h2><ol><li><b>首页先回答下一步。</b>待接单、低库存和未回复反馈应能直接展开处理上下文。</li><li><b>统计口径比装饰重要。</b>区分累计核销收入、今日预约和当前队列，不把它们当作同一时间范围。</li><li><b>图表要有主次。</b>一张主要趋势配列表或比较矩阵；不为凑齐卡片加入无关地图和仪表盘。</li><li><b>导航由任务决定。</b>四个业务模块可用紧凑侧栏、顶栏或底部岛；避免重复导航和介绍卡。</li><li><b>数据承担视觉中心。</b>收入、状态与时间的字号大于说明；辅助文字保持可读对比。</li><li><b>留白用于分组。</b>高密度订单行与低密度分析区可以共存，不必所有模块等高等宽。</li><li><b>颜色编码业务状态。</b>品牌墨绿为主，少量暖橙标待处理；不使用强霓虹和无意义渐变。</li><li><b>空状态提供出路。</b>没有数据时说明口径或提供进入业务的按钮，避免保留一张空坐标轴。</li></ol></section><div class="research-grid">''' + '\n'.join(case_blocks) + '''</div><section class="restricted-cases"><h2>18 条受限作品链接</h2><p>这些标题与作者经搜索索引核对。访问未成功，不推断其实际布局、字体、图表或动效，也不计入上方 20 个视觉研究案例。</p><div class="table-scroll"><table><thead><tr><th>编号</th><th>原始作品链接</th><th>访问情况</th><th>采用范围</th></tr></thead><tbody>''' + restricted + '''</tbody></table></div></section><p class="research-end">外部截图仅存放于研究证据目录；本地原型没有复用他人完整界面、代码或外部截图。</p></main></body></html>''', encoding='utf-8')

comparison = '| 编号 | 方案 | 导航与结构 | 工作重点 | 实施成本 |\n|---|---|---|---|---|\n' + '\n'.join(f'| {c["id"]} | {c["name"]} | {c["layout"]} | {c["priority"]} | {c["cost"]} |' for c in concepts)
(ROOT / 'comparison.md').write_text('# 10 套初始方案 + 第11套融合原型对比\n\n' + comparison + '\n\n成本仅按现有 Vue 页面结构相对估计，不是工时承诺。01 和 04 与当前模块结构最接近；07、08 强化范围或时间协同；09 若加入真实 AI 能力需要另行定义需求。\n\n## 融合建议\n\n- 01 的清晰信息层级 + 10 的餐饮识别：适合日常经营后台。\n- 02 的订单看板 + 07 的窗口切换：适合全校管理员高峰调度。\n- 03 的品牌排版 + 04 的列表密度：适合偏极简的成熟产品。\n\n未选择前不提取正式组件规范、不修改现有后台。\n', encoding='utf-8')
print(f'Generated {len(concepts)} prototypes, gallery, research and comparison.')
