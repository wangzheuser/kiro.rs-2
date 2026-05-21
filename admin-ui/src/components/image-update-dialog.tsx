import { useEffect, useState } from 'react'
import {
  ChevronDown,
  Download,
  ExternalLink,
  Info,
  RefreshCw,
  RotateCcw,
  Save,
  Sparkles,
  UploadCloud,
} from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  applyImageUpdate,
  checkSystemUpdate,
  getUpdateConfig,
  pullUpdateImage,
  rollbackImageUpdate,
  setUpdateConfig,
} from '@/api/credentials'
import { extractErrorMessage } from '@/lib/utils'

interface ImageUpdateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** 把 RFC3339 时间转成本地时区可读字符串。解析失败时原样返回。 */
function formatDateTime(value: string): string {
  if (!value) return '—'
  const t = Date.parse(value)
  if (Number.isNaN(t)) return value
  return new Date(t).toLocaleString()
}

export function ImageUpdateDialog({ open, onOpenChange }: ImageUpdateDialogProps) {
  const queryClient = useQueryClient()
  const [image, setImage] = useState('')
  const [autoApplyTime, setAutoApplyTime] = useState('03:00')
  const [lastOutput, setLastOutput] = useState('')
  const [tipsOpen, setTipsOpen] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['update-config'],
    queryFn: getUpdateConfig,
    enabled: open,
  })

  // 弹窗打开时复用 dashboard 已发起的请求；后台 30 分钟缓存避免重复打 GitHub。
  const { data: updateCheck, isFetching: checkingUpdate } = useQuery({
    queryKey: ['system-update-check'],
    queryFn: () => checkSystemUpdate(false),
    enabled: open,
    staleTime: 5 * 60 * 1000,
  })

  const refreshUpdateCheck = useMutation({
    mutationFn: () => checkSystemUpdate(true),
    onSuccess: (info) => {
      queryClient.setQueryData(['system-update-check'], info)
      if (info.warning) {
        toast.error(info.warning)
      } else if (info.hasUpdate) {
        toast.success(`发现新版本 v${info.latestVersion}`)
      } else {
        toast.success('当前已是最新版本')
      }
    },
    onError: (err) => toast.error(`检查更新失败: ${extractErrorMessage(err)}`),
  })

  const autoApplyMutation = useMutation({
    mutationFn: (autoApply: boolean) => setUpdateConfig({ autoApply }),
    onMutate: async (autoApply) => {
      // 先做乐观更新，开关切换的视觉反馈瞬时生效
      const prev = queryClient.getQueryData<typeof data>(['update-config'])
      if (prev) {
        queryClient.setQueryData(['update-config'], { ...prev, autoApply })
      }
      return { prev }
    },
    onSuccess: (res) => {
      queryClient.setQueryData(['update-config'], res)
      toast.success(res.autoApply ? '已开启自动更新' : '已关闭自动更新')
    },
    onError: (err, _variables, ctx) => {
      if (ctx?.prev) {
        queryClient.setQueryData(['update-config'], ctx.prev)
      }
      toast.error(`切换失败: ${extractErrorMessage(err)}`)
    },
  })

  const autoApplyTimeMutation = useMutation({
    mutationFn: (autoApplyTime: string) => setUpdateConfig({ autoApplyTime }),
    onSuccess: (res) => {
      queryClient.setQueryData(['update-config'], res)
      toast.success(`自动更新时间已设为 ${res.autoApplyTime}`)
    },
    onError: (err) => toast.error(`保存时间失败: ${extractErrorMessage(err)}`),
  })

  useEffect(() => {
    if (!data) return
    setImage(data.image || '')
    setAutoApplyTime(data.autoApplyTime || '03:00')
  }, [data])

  const saveMutation = useMutation({
    mutationFn: () =>
      setUpdateConfig({
        image: image.trim(),
      }),
    onSuccess: () => {
      toast.success('更新配置已保存')
      queryClient.invalidateQueries({ queryKey: ['update-config'] })
    },
    onError: (err) => toast.error(`保存失败: ${extractErrorMessage(err)}`),
  })

  const pullMutation = useMutation({
    mutationFn: pullUpdateImage,
    onSuccess: (res) => {
      setLastOutput(res.output || res.message)
      toast.success(res.message)
    },
    onError: (err) => toast.error(`拉取失败: ${extractErrorMessage(err)}`),
  })

  const applyMutation = useMutation({
    mutationFn: applyImageUpdate,
    onSuccess: (res) => {
      setLastOutput(res.output || res.message)
      toast.success(res.message)
      queryClient.invalidateQueries({ queryKey: ['update-config'] })
    },
    onError: (err) => toast.error(`更新失败: ${extractErrorMessage(err)}`),
  })

  const rollbackMutation = useMutation({
    mutationFn: rollbackImageUpdate,
    onSuccess: (res) => {
      setLastOutput(res.output || res.message)
      toast.success(res.message)
      queryClient.invalidateQueries({ queryKey: ['update-config'] })
    },
    onError: (err) => toast.error(`回退失败: ${extractErrorMessage(err)}`),
  })

  const busy =
    isLoading ||
    saveMutation.isPending ||
    pullMutation.isPending ||
    applyMutation.isPending ||
    rollbackMutation.isPending ||
    autoApplyMutation.isPending ||
    autoApplyTimeMutation.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-describedby={undefined}
        className="sm:max-w-2xl max-h-[85vh] overflow-y-auto"
        onOpenAutoFocus={(e) => {
          // 阻止 Radix 默认把焦点丢到第一个可聚焦子元素（信息按钮），
          // 否则 Tooltip 的受控开关会被 onFocus 立刻触发。
          e.preventDefault()
        }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UploadCloud className="h-4 w-4" />
            镜像在线更新
            <TooltipProvider delayDuration={0} disableHoverableContent={false}>
              <Tooltip open={tipsOpen} onOpenChange={setTipsOpen}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label="在线更新前置条件"
                    onClick={() => setTipsOpen((v) => !v)}
                    onMouseEnter={() => setTipsOpen(true)}
                    onMouseLeave={() => setTipsOpen(false)}
                    className="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                  >
                    <Info className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent
                  side="bottom"
                  align="start"
                  sideOffset={6}
                  collisionPadding={12}
                  onMouseEnter={() => setTipsOpen(true)}
                  onMouseLeave={() => setTipsOpen(false)}
                >
                  <div className="mb-1 font-medium">在线更新前置条件</div>
                  <ul className="list-disc space-y-1 pl-4">
                    <li>
                      容器由 <code className="font-mono">docker compose</code> 启动
                    </li>
                    <li>
                      容器挂载 <code className="font-mono">/var/run/docker.sock</code>
                    </li>
                    <li>
                      宿主机 <code className="font-mono">docker-compose.yml</code> 仍在原位置
                    </li>
                  </ul>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="rounded-md border p-3 space-y-3">
            {data?.previousImage && (
              <div className="text-xs text-muted-foreground">
                上一版本：
                <code className="font-mono">{data.previousImage}</code>
                （可一键回退）
              </div>
            )}

            <label className="grid gap-1">
              <span className="text-xs font-medium text-muted-foreground">镜像</span>
              <Input
                value={image}
                onChange={(e) => setImage(e.target.value)}
                placeholder="zyphrzero/kiro-rs:latest"
                disabled={busy}
                className="font-mono text-sm"
              />
            </label>
          </div>

          <div
            className={`rounded-md border p-3 ${
              updateCheck?.hasUpdate
                ? 'border-amber-500/40 bg-amber-50 dark:bg-amber-950/30'
                : 'bg-muted/30'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Sparkles className="h-4 w-4" />
                版本信息
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy || refreshUpdateCheck.isPending}
                onClick={() => refreshUpdateCheck.mutate()}
              >
                {refreshUpdateCheck.isPending || checkingUpdate ? (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                <span className="ml-1.5">立即检查</span>
              </Button>
            </div>

            <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1.5 text-xs sm:grid-cols-2">
              <div className="flex items-baseline gap-2">
                <dt className="w-20 shrink-0 text-muted-foreground">当前版本</dt>
                <dd className="font-mono">
                  {updateCheck?.currentVersion
                    ? `v${updateCheck.currentVersion}`
                    : '加载中…'}
                </dd>
              </div>
              <div className="flex items-baseline gap-2">
                <dt className="w-20 shrink-0 text-muted-foreground">最新版本</dt>
                <dd className="font-mono">
                  {updateCheck?.latestVersion
                    ? `v${updateCheck.latestVersion}`
                    : updateCheck
                      ? '未知'
                      : '加载中…'}
                  {updateCheck?.hasUpdate && (
                    <Badge variant="success" className="ml-2 align-middle">
                      可更新
                    </Badge>
                  )}
                </dd>
              </div>
              <div className="flex items-baseline gap-2">
                <dt className="w-20 shrink-0 text-muted-foreground">构建类型</dt>
                <dd className="font-mono">
                  {updateCheck?.buildType || '加载中…'}
                </dd>
              </div>
              <div className="flex items-baseline gap-2">
                <dt className="w-20 shrink-0 text-muted-foreground">发布时间</dt>
                <dd className="font-mono">
                  {updateCheck?.publishedAt
                    ? formatDateTime(updateCheck.publishedAt)
                    : '—'}
                </dd>
              </div>
            </dl>

            {updateCheck?.releaseNotes && (
              <ReleaseNotesPanel
                version={updateCheck.latestVersion}
                title={updateCheck.releaseName}
                notes={updateCheck.releaseNotes}
                href={updateCheck.releaseUrl}
              />
            )}

            {!updateCheck?.releaseNotes && updateCheck?.releaseUrl && (
              <div className="mt-2 text-xs">
                <a
                  href={updateCheck.releaseUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="underline hover:no-underline"
                >
                  查看 Release Notes
                </a>
              </div>
            )}

            {updateCheck?.warning && (
              <div className="mt-2 text-xs text-destructive">{updateCheck.warning}</div>
            )}

            <div className="mt-3 space-y-3 border-t pt-3">
              <div className="flex items-start justify-between gap-3">
                <div className="text-xs">
                  <div className="font-medium text-foreground">无人值守自动更新</div>
                  <div className="text-muted-foreground">
                    开启后服务每天到指定时间自动检查新版本，发现新版即拉取镜像并重建容器。
                  </div>
                </div>
                <Switch
                  checked={!!data?.autoApply}
                  disabled={busy}
                  onCheckedChange={(checked) => autoApplyMutation.mutate(checked)}
                />
              </div>

              <label
                className={`flex items-center justify-between gap-3 text-xs ${
                  data?.autoApply ? '' : 'opacity-60'
                }`}
              >
                <span className="text-muted-foreground">触发时间（本地时区，HH:MM）</span>
                <Input
                  type="time"
                  value={autoApplyTime}
                  onChange={(e) => setAutoApplyTime(e.target.value)}
                  onBlur={() => {
                    if (autoApplyTime && autoApplyTime !== data?.autoApplyTime) {
                      autoApplyTimeMutation.mutate(autoApplyTime)
                    }
                  }}
                  disabled={busy || !data?.autoApply}
                  className="w-28 font-mono text-sm"
                />
              </label>
            </div>
          </div>

          {lastOutput && (
            <div className="rounded-md border bg-muted/40 p-3">
              <div className="mb-2 text-xs font-medium text-muted-foreground">最近输出</div>
              <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words text-xs">
                {lastOutput}
              </pre>
            </div>
          )}
        </div>

        <DialogFooter className="flex-wrap gap-2 sm:justify-between">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={busy || !image.trim()}
              onClick={() => saveMutation.mutate()}
            >
              {saveMutation.isPending ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              保存配置
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy || !image.trim()}
              onClick={() => pullMutation.mutate()}
            >
              {pullMutation.isPending ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              拉取镜像
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy || !data?.previousImage}
              onClick={() => rollbackMutation.mutate()}
              title={
                data?.previousImage
                  ? `回退到 ${data.previousImage}`
                  : '尚未记录可回退的版本'
              }
            >
              {rollbackMutation.isPending ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RotateCcw className="h-4 w-4 mr-2" />
              )}
              回退到上一版本
            </Button>
          </div>
          <Button
            type="button"
            disabled={busy || !image.trim()}
            onClick={() => applyMutation.mutate()}
          >
            {applyMutation.isPending ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <UploadCloud className="h-4 w-4 mr-2" />
            )}
            更新并重启
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
interface ReleaseNotesPanelProps {
  version: string
  title?: string
  notes: string
  href?: string
}

/**
 * 折叠面板：展示当前版本的 Changelog（GitHub Release body 原文）。
 *
 * 内容是 markdown 文本，但使用方写得比较朴素（标题 / 列表 / 代码块），
 * 直接用 `whitespace-pre-wrap` 渲染原文足够清晰，不引入 markdown 渲染器
 * 以保持产物体积。需要打开浏览器查看完整渲染时点击「在 GitHub 查看」。
 */
function ReleaseNotesPanel({ version, title, notes, href }: ReleaseNotesPanelProps) {
  const [open, setOpen] = useState(false)
  return (
    <div className="mt-3 rounded-md border bg-background/40">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-xs font-medium text-foreground hover:bg-accent/40"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2">
          <span>查看 v{version} 更新内容</span>
          {title && (
            <span className="font-normal text-muted-foreground">— {title}</span>
          )}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div className="border-t px-3 py-2.5 text-xs">
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words leading-relaxed text-muted-foreground">
            {notes}
          </pre>
          {href && (
            <div className="mt-2">
              <a
                href={href}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs underline hover:no-underline"
              >
                <ExternalLink className="h-3 w-3" />
                在 GitHub 查看完整 Release
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
