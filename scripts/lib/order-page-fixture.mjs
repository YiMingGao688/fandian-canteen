/* 浏览器隔离用服务器响应样本；真实 SQL 的筛选、权限及超过百条历史由 JUnit 临时数据库验证。 */
export function orderPageFixture(records,url,scopeWindow=null){
  const params=new URL(url).searchParams,state=params.get('state')||'active',term=(params.get('keyword')||'').toLowerCase()
  const window=scopeWindow||params.get('windowId'),from=params.get('fromDate'),to=params.get('toDate')
  const rows=records.filter(row=>(state==='all'||state==='active'?[2,3,4].includes(Number(row.status))||state==='all':Number(row.status)===Number(state))&&(!window||String(row.windowId)===String(window))&&(!from||row.serviceDate>=from)&&(!to||row.serviceDate<=to)&&(!term||[row.studentName,row.studentNo,row.number,row.windowName,row.canteenName,...(row.items||[]).map(item=>item.name)].join(' ').toLowerCase().includes(term)))
  const priority={2:0,3:1,4:2,1:3,5:4,6:5}
  rows.sort((a,b)=>priority[a.status]-priority[b.status]||([2,3,4].includes(Number(a.status))?(Date.parse(`${a.serviceDate}T${a.endTime}:00+08:00`)||Infinity)-(Date.parse(`${b.serviceDate}T${b.endTime}:00+08:00`)||Infinity):0)||Number(b.id)-Number(a.id))
  const page=Number(params.get('page')||1),size=Number(params.get('pageSize')||6)
  return {total:rows.length,records:rows.slice((page-1)*size,page*size)}
}
