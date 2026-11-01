"""Add admin and read-only screen demo identities without changing existing students or orders."""
from local_runtime import mysql
from seed_data import password_hash, quote
for username, name, role in [('canteen_admin','食堂管理员','ADMIN'),('canteen_screen','校园食堂大屏','SCREEN')]:
    present=mysql('SELECT role FROM campus_account WHERE username='+quote(username)+';','campus_ordering').stdout.decode().strip()
    if present:
        assert present==role, 'Existing account role differs; refusing to overwrite'
        continue
    sql='INSERT INTO user(openid,name,create_time) VALUES('+quote('campus:'+username)+','+quote(name)+',NOW()); SET @new_id=LAST_INSERT_ID(); '
    sql+='INSERT INTO campus_account(user_id,username,password_hash,display_name,role,enabled) VALUES(@new_id,'+','.join(map(quote,[username,password_hash('Campus@2026'),name,role]))+',1);'
    mysql(sql,'campus_ordering')
    print('Added local demo identity:',role)
