package com.sky.task;

import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.Date;

/**
 * 自定义定时任务类
 */
@Component
@Slf4j
// 上游教学演示任务只写日志；校园运行默认关闭，避免每 5 秒产生一条无用 INFO 记录。
@ConditionalOnProperty(name = "campus.legacy-jobs-enabled", havingValue = "true", matchIfMissing = true)
public class MyTask {

    /**
     * 定时任务 每隔5秒触发一次
     */
    @Scheduled(cron = "0/5 * * * * ?")
    public void executeTask(){
        log.info("定时任务开始执行：{}",new Date());
    }
}
