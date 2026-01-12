import { dir } from './dir'
import { logger } from 'node-karin'
import { initDingTalkService } from './dingtalk/service'

logger.info(`${logger.violet(`[插件:${dir.version}]`)} ${logger.green(dir.name)} 初始化完成`)

initDingTalkService().catch((error: unknown) => {
  logger.error('[dingtalk] 初始化失败')
  logger.error(error)
})
