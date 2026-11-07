Component({
  data: {
    selected: -1,
    hidden: false,
    // 顺序与 app.json 的 tabBar.list 一致，路由仍由微信管理。
    tabs: [
      { pagePath: 'pages/home/index', text: '点餐', icon: 'meal' },
      { pagePath: 'pages/orders/index', text: '预约', icon: 'calendar' },
      { pagePath: 'pages/notices/index', text: '公告', icon: 'bell' },
      { pagePath: 'pages/profile/index', text: '我的', icon: 'person' },
    ],
  },

  lifetimes: {
    attached() {
      // 首次进入或从指定页面打开时，底栏创建前可能已经触发了页面 onShow。
      const pages = getCurrentPages()
      const route = pages[pages.length - 1]?.route
      const selected = this.data.tabs.findIndex(tab => tab.pagePath === route)
      if (selected >= 0) this.setData({ selected })
    },
  },

  methods: {
    /** 防止切换过程中重复跳转，目标页显示后再同步选中态。 */
    openTab(event) {
      const index = Number(event.currentTarget.dataset.index)
      const tab = this.data.tabs[index]
      if (!tab || index === this.data.selected || this.switching) return
      this.switching = true
      wx.switchTab({
        url: '/' + tab.pagePath,
        fail: () => wx.showToast({ title: '切换失败，请重试', icon: 'none' }),
        complete: () => { this.switching = false },
      })
    },
  },
})
