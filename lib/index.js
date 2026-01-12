import {
  initDingTalkService
} from "./chunk-I5WRCRMI.js";
import {
  dir
} from "./chunk-NF24Q4FD.js";

// src/index.ts
import { logger } from "node-karin";
logger.info(`${logger.violet(`[\u63D2\u4EF6:${dir.version}]`)} ${logger.green(dir.name)} \u521D\u59CB\u5316\u5B8C\u6210`);
initDingTalkService().catch((error) => {
  logger.error("[dingtalk] \u521D\u59CB\u5316\u5931\u8D25");
  logger.error(error);
});
