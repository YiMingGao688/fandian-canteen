Component({
  properties: {
    dates: Array,
    dateIndex: Number,
    slots: Array,
    slotIndex: { type: Number, value: -1 },
    loading: Boolean,
    failed: Boolean,
    busy: Boolean,
  },
  data: {
    dateOptions: [],
    expanded: false,
  },
  observers: {
    dates(dates) {
      const dateOptions = dates.map((date, index) => ({
        key: date,
        name: index === 0 ? '今天' : '明天',
        date: `${Number(date.slice(5, 7))}月${Number(date.slice(8, 10))}日`,
      }))
      this.setData({ dateOptions })
    },
    dateIndex() {
      if (this.data.expanded) this.setData({ expanded: false })
    },
  },
  methods: {
    /** 提交选择给页面，时段余量和可预约范围由页面从后端读取。 */
    selectDate(e) {
      const value = Number(e.currentTarget.dataset.index)
      if (this.data.busy || !this.data.dates[value] || value === this.data.dateIndex) return
      this.triggerEvent('datechange', { value })
    },
    selectSlot(e) {
      const value = Number(e.currentTarget.dataset.index)
      if (this.data.busy || this.data.loading || !this.data.slots[value]) return
      this.triggerEvent('slotchange', { value })
    },
    toggleSlots() {
      this.setData({ expanded: !this.data.expanded })
    },
    retry() {
      this.triggerEvent('retry')
    },
  },
})
