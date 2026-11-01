"""Apply only the window-scope and read-only dashboard queries to the new campus mapper."""
from pathlib import Path
path=Path(__file__).resolve().parents[1]/'backend/sky-server/src/main/resources/mapper/CampusMapper.xml'
text=path.read_text(encoding='utf-8')
text=text.replace('where window_id=#{windowId} and pickup_code=#{code}', 'where pickup_code=#{code} <if test="windowId != null">and window_id=#{windowId}</if>')
text=text.replace('where id=#{reply.id} and window_id=#{windowId}', 'where id=#{reply.id} <if test="windowId != null">and window_id=#{windowId}</if>')
text=text.replace('where co.window_id=#{windowId}', 'where 1=1 <if test="windowId != null">and co.window_id=#{windowId}</if>')
extra='''
    <!-- 独立展示大屏只使用汇总字段，不返回任何学号、姓名或取餐凭证。 -->
    <select id="windowOverview" resultType="map">
      select w.id,w.name,w.canteen_name canteenName,w.location,
        count(case when o.status between 1 and 5 then 1 end) reservations,
        count(case when o.status=2 then 1 end) pending,
        count(case when o.status=3 then 1 end) preparing,
        count(case when o.status=4 then 1 end) ready,
        count(case when o.status=5 then 1 end) completed
      from campus_window w
      left join campus_order co on co.window_id=w.id and co.slot_id in (select id from campus_slot where service_date=#{date})
      left join orders o on o.id=co.order_id
      group by w.id,w.name,w.canteen_name,w.location order by w.id
    </select>
    <select id="slotUsage" resultType="map">select coalesce(sum(reserved),0) occupied,coalesce(sum(capacity),0) capacity,count(*) publishedSlots from campus_slot where service_date=#{date}</select>
    <select id="slotDistribution" resultType="map">select start_time name,sum(reserved) value from campus_slot where service_date=#{date} group by start_time order by start_time</select>
    <select id="activity" resultType="map">select right(o.number,6) orderSuffix,w.name windowName,o.status,date_format(o.order_time,'%H:%i') orderTime,s.start_time pickupTime from orders o join campus_order co on co.order_id=o.id join campus_window w on w.id=co.window_id join campus_slot s on s.id=co.slot_id order by o.id desc limit 8</select>
'''
if 'id="windowOverview"' not in text:
    text=text.replace('</mapper>',extra+'\n</mapper>')
path.write_text(text,encoding='utf-8')
print('Updated campus window scope and added four aggregate-only screen queries')
