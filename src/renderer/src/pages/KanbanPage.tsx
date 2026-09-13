import { useState } from 'react'
import { TaskEditor } from '@renderer/features/missions/TaskEditor'
import { KanbanBoard } from '@renderer/features/missions/KanbanBoard'
import { Button } from '@renderer/components/Button'
import { useI18n } from '@renderer/i18n'
import '@renderer/features/missions/missions.css'

/** Le tableau, pour TOUTES les apps à la fois. Le tableau scopé à une seule
 *  app vit dans son onglet « Tableau » (AppPage), via le même KanbanBoard. */
export function KanbanPage(): JSX.Element {
  const { t } = useI18n()
  const [openTask, setOpenTask] = useState<string | null>(null)
  const [composing, setComposing] = useState(false)

  return (
    <div className="page page--wide">
      <header className="page__head">
        <div>
          <span className="mc-label">Mission board</span>
          <h1 className="page__title">{t('nav.board')}</h1>
        </div>
        <Button onClick={() => setComposing(true)}>{t('task.new')}</Button>
      </header>

      <KanbanBoard onOpen={setOpenTask} />

      {composing && <TaskEditor onClose={() => setComposing(false)} />}
      {openTask && <TaskEditor taskId={openTask} onClose={() => setOpenTask(null)} />}
    </div>
  )
}
