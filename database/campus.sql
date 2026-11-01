-- 校园扩展表。仅在 start.ps1 创建的独立 campus_ordering 数据库首次初始化时执行。
-- 原 dish、orders、order_detail、shopping_cart、user 等表沿用上游结构。
CREATE TABLE campus_window (
  id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '食堂窗口主键',
  canteen_name VARCHAR(40) NOT NULL COMMENT '食堂名称',
  name VARCHAR(40) NOT NULL COMMENT '窗口名称',
  location VARCHAR(120) NOT NULL COMMENT '学生实际取餐位置',
  description VARCHAR(240) NOT NULL COMMENT '窗口介绍',
  capacity INT NOT NULL DEFAULT 12 COMMENT '每个预约时段可接收的订单数',
  opening_hours VARCHAR(80) NOT NULL COMMENT '对外营业时间说明',
  enabled TINYINT NOT NULL DEFAULT 1 COMMENT '是否开放预约'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE campus_account (
  user_id BIGINT PRIMARY KEY COMMENT '关联原 user 主键',
  username VARCHAR(24) NOT NULL UNIQUE COMMENT '学生学号或窗口工作账号',
  password_hash VARCHAR(160) NOT NULL COMMENT 'PBKDF2 参数和随机盐摘要',
  display_name VARCHAR(32) NOT NULL COMMENT '用户称呼',
  role VARCHAR(16) NOT NULL COMMENT 'STUDENT 学生、STAFF 窗口人员',
  window_id BIGINT NULL COMMENT '工作人员所属窗口，学生为空',
  enabled TINYINT NOT NULL DEFAULT 1 COMMENT '账号是否允许使用',
  CONSTRAINT fk_campus_account_user FOREIGN KEY (user_id) REFERENCES user(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE campus_dish (
  dish_id BIGINT PRIMARY KEY COMMENT '关联原 dish 主键',
  window_id BIGINT NOT NULL COMMENT '菜品所属窗口',
  stock INT NOT NULL DEFAULT 0 COMMENT '当前可售份数，预约扣减、取消归还',
  calories INT NOT NULL DEFAULT 0 COMMENT '演示菜谱每份能量估算，单位千卡',
  tags VARCHAR(100) NOT NULL DEFAULT '' COMMENT '口味与营养展示标签',
  CONSTRAINT fk_campus_dish FOREIGN KEY (dish_id) REFERENCES dish(id),
  CONSTRAINT fk_campus_window FOREIGN KEY (window_id) REFERENCES campus_window(id),
  CONSTRAINT ck_campus_stock CHECK (stock >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE campus_slot (
  id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '单日预约时段主键',
  window_id BIGINT NOT NULL COMMENT '预约窗口',
  service_date DATE NOT NULL COMMENT '上海时区的就餐日期',
  start_time VARCHAR(5) NOT NULL COMMENT '取餐时段起点',
  end_time VARCHAR(5) NOT NULL COMMENT '取餐时段终点',
  capacity INT NOT NULL COMMENT '本时段预约名额总量',
  reserved INT NOT NULL DEFAULT 0 COMMENT '已被有效订单占用的名额',
  UNIQUE KEY uk_campus_slot(window_id,service_date,start_time),
  CONSTRAINT ck_campus_capacity CHECK (reserved >= 0 AND reserved <= capacity)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE campus_order (
  order_id BIGINT PRIMARY KEY COMMENT '关联原 orders 主键',
  user_id BIGINT NOT NULL COMMENT '预约学生主键，与原订单一致',
  window_id BIGINT NOT NULL COMMENT '订单取餐窗口',
  slot_id BIGINT NOT NULL COMMENT '预约时段主键',
  request_id VARCHAR(64) NOT NULL COMMENT '用户请求去重标识',
  pickup_code VARCHAR(8) NULL UNIQUE COMMENT '支付后生成的核销凭证',
  demo BOOLEAN NOT NULL DEFAULT FALSE COMMENT '是否为初始化演示记录',
  picked_up_at DATETIME NULL COMMENT '窗口实际核销时间',
  UNIQUE KEY uk_campus_request(user_id,request_id),
  KEY ix_campus_window(window_id,slot_id),
  CONSTRAINT fk_campus_order FOREIGN KEY (order_id) REFERENCES orders(id),
  CONSTRAINT fk_campus_slot FOREIGN KEY (slot_id) REFERENCES campus_slot(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE campus_favorite (
  user_id BIGINT NOT NULL COMMENT '收藏学生',
  dish_id BIGINT NOT NULL COMMENT '收藏菜品',
  PRIMARY KEY(user_id,dish_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE campus_review (
  id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '订单评价主键',
  order_id BIGINT NOT NULL UNIQUE COMMENT '已核销订单，一单只能评价一次',
  user_id BIGINT NOT NULL COMMENT '评价学生',
  rating INT NOT NULL COMMENT '一至五星',
  content VARCHAR(300) NOT NULL COMMENT '学生评价正文',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '评价创建时间',
  CONSTRAINT ck_campus_rating CHECK (rating BETWEEN 1 AND 5)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE campus_notice (
  id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '公告主键',
  title VARCHAR(100) NOT NULL COMMENT '公告标题',
  content VARCHAR(1000) NOT NULL COMMENT '公告正文',
  category VARCHAR(20) NOT NULL COMMENT '公告类别',
  published_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '发布时间'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE campus_feedback (
  id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '反馈主键',
  user_id BIGINT NOT NULL COMMENT '反馈学生',
  window_id BIGINT NOT NULL COMMENT '负责接收与回复的窗口',
  content VARCHAR(500) NOT NULL COMMENT '学生反馈内容',
  reply VARCHAR(500) NULL COMMENT '窗口回复',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '提交时间'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
