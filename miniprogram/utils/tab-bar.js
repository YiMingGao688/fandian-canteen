/** 同步当前页的底栏选中项，并为需要占据屏幕底部的弹层收起导航。 */
module.exports = function selectTab(page, selected, hidden = false) {
  const bar = typeof page.getTabBar === 'function' && page.getTabBar()
  if (bar && (bar.data.selected !== selected || bar.data.hidden !== hidden)) {
    bar.setData({ selected, hidden })
  }
}
