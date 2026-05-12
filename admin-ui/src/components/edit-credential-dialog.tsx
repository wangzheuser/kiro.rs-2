import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useUpdateCredential } from '@/hooks/use-credentials'
import { extractErrorMessage } from '@/lib/utils'
import type { CredentialStatusItem } from '@/types/api'

interface EditCredentialDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  credential: CredentialStatusItem
}

export function EditCredentialDialog({
  open,
  onOpenChange,
  credential,
}: EditCredentialDialogProps) {
  const [email, setEmail] = useState(credential.email ?? '')
  const [proxyUrl, setProxyUrl] = useState(credential.proxyUrl ?? '')
  const [proxyUsername, setProxyUsername] = useState('')
  const [proxyPassword, setProxyPassword] = useState('')

  // 每次打开时重置表单为当前凭据值
  useEffect(() => {
    if (open) {
      setEmail(credential.email ?? '')
      setProxyUrl(credential.proxyUrl ?? '')
      setProxyUsername('')
      setProxyPassword('')
    }
  }, [open, credential])

  const { mutate, isPending } = useUpdateCredential()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    mutate(
      {
        id: credential.id,
        req: {
          email: email,
          proxyUrl: proxyUrl,
          proxyUsername: proxyUsername || undefined,
          proxyPassword: proxyPassword || undefined,
        },
      },
      {
        onSuccess: (data) => {
          toast.success(data.message)
          onOpenChange(false)
        },
        onError: (error: unknown) => {
          toast.error(`更新失败: ${extractErrorMessage(error)}`)
        },
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            编辑凭据 #{credential.id}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            {/* 邮箱 */}
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium">
                邮箱（用于显示标识）
              </label>
              <Input
                id="email"
                type="email"
                placeholder="例: user@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isPending}
              />
              <p className="text-xs text-muted-foreground">
                留空则显示凭据 ID，清除请提交空值
              </p>
            </div>

            {/* 代理配置 */}
            <div className="space-y-2">
              <label className="text-sm font-medium">代理配置</label>
              <Input
                id="proxyUrl"
                placeholder='代理 URL（留空使用全局配置，"direct" 不使用代理）'
                value={proxyUrl}
                onChange={(e) => setProxyUrl(e.target.value)}
                disabled={isPending}
              />
              <div className="grid grid-cols-2 gap-2">
                <Input
                  id="proxyUsername"
                  placeholder="代理用户名（留空不修改）"
                  value={proxyUsername}
                  onChange={(e) => setProxyUsername(e.target.value)}
                  disabled={isPending}
                />
                <Input
                  id="proxyPassword"
                  type="password"
                  placeholder="代理密码（留空不修改）"
                  value={proxyPassword}
                  onChange={(e) => setProxyPassword(e.target.value)}
                  disabled={isPending}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                代理 URL 留空使用全局代理；输入 "direct" 显式不使用代理
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              取消
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? '保存中...' : '保存'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
