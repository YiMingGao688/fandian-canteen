// 所有方案共用的业务样本。仅为设计比较 Mock，不代表实际数据库数据或支付效果。
window.EXPLORATION_DATA = {
  date: '2026-11-05', summary: {revenue:18624,totalOrders:1258,todayOrders:186,completed:1016,pending:18,preparing:32,ready:14},
  windows:[
    {id:1,name:'烟火小炒',canteenName:'一食堂',revenue:8240,todayOrders:80,totalOrders:568,completed:458,pending:8,preparing:15,ready:6,feedback:1},
    {id:2,name:'轻食计划',canteenName:'二食堂',revenue:6054,todayOrders:64,totalOrders:402,completed:326,pending:6,preparing:10,ready:4,feedback:1},
    {id:3,name:'麦香面馆',canteenName:'一食堂',revenue:4330,todayOrders:42,totalOrders:288,completed:232,pending:4,preparing:7,ready:4,feedback:1}
  ],
  trend:[1420,1580,1785,1690,2016,2060,2295],previous:[1080,1160,1390,1480,1630,1750,1980],
  dates:['10/30','10/31','11/01','11/02','11/03','11/04','11/05'],
  sales:[
    {id:1,windowId:1,name:'照烧鸡腿饭',category:'主食',value:268,stock:23,price:16.8,image:'chicken'},
    {id:2,windowId:2,name:'牛油果轻食碗',category:'轻食',value:216,stock:9,price:19.8,image:'salad'},
    {id:3,windowId:3,name:'番茄牛肉面',category:'面点',value:184,stock:18,price:15.8,image:'noodles'},
    {id:4,windowId:1,name:'番茄牛腩饭',category:'主食',value:152,stock:21,price:18.8,image:'beef'},
    {id:5,windowId:3,name:'手作鲜橙饮',category:'汤饮',value:118,stock:7,price:6.5,image:'orange'},
    {id:6,windowId:2,name:'紫菜蛋花汤',category:'汤饮',value:96,stock:36,price:3.5,image:'soup'}
  ],
  preferences:[{name:'主食',value:420},{name:'轻食',value:216},{name:'面点',value:184},{name:'汤饮',value:214}],
  orders:[
    {id:'HX11051038',studentName:'林同学',windowId:1,status:2,startTime:'11:20',endTime:'11:40',amount:16.8,items:'照烧鸡腿饭 ×1',remark:'少辣，自带餐盒'},
    {id:'HX11051037',studentName:'陈同学',windowId:2,status:3,startTime:'11:20',endTime:'11:40',amount:19.8,items:'牛油果轻食碗 ×1',remark:'酱料分装'},
    {id:'HX11051036',studentName:'周同学',windowId:3,status:4,startTime:'11:00',endTime:'11:20',amount:22.3,items:'番茄牛肉面 ×1 · 手作鲜橙饮 ×1',remark:'正常口味'},
    {id:'HX11051035',studentName:'许同学',windowId:1,status:2,startTime:'11:40',endTime:'12:00',amount:18.8,items:'番茄牛腩饭 ×1',remark:'需要餐具'},
    {id:'HX11051034',studentName:'宋同学',windowId:2,status:3,startTime:'12:00',endTime:'12:20',amount:23.3,items:'牛油果轻食碗 ×1 · 紫菜蛋花汤 ×1',remark:'需要餐具'},
    {id:'HX11051033',studentName:'吴同学',windowId:3,status:4,startTime:'11:20',endTime:'11:40',amount:15.8,items:'番茄牛肉面 ×1',remark:'不要香菜'}
  ],
  slots:[
    {time:'11:00',capacity:[12,12,10],reserved:[9,7,6]}, {time:'11:20',capacity:[12,12,10],reserved:[11,9,8]},
    {time:'11:40',capacity:[12,12,10],reserved:[10,10,7]}, {time:'12:00',capacity:[12,12,10],reserved:[8,7,6]},
    {time:'12:20',capacity:[12,12,10],reserved:[6,5,4]}, {time:'12:40',capacity:[12,12,10],reserved:[4,3,2]}
  ], feedback:[{id:1,windowId:1,content:'希望午餐高峰可以增加取餐指引。'},{id:2,windowId:2,content:'建议增加一款不含坚果的轻食。'},{id:3,windowId:3,content:'取餐时请核对不要香菜的备注。'}]
}
