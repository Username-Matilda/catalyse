import { useId, type ComponentProps, type FC } from 'react'
import type { DragEndEvent } from '@dnd-kit/core'

type DndKit = typeof import('@dnd-kit/core')
type DndContextProps = ComponentProps<DndKit['DndContext']>
type DragEnd = (event: DragEndEvent) => void
type Captured = { id: string; props: DndContextProps; renderedAt: number }

/**
 * Drags have no geometry in happy-dom, so no sequence of pointer events produces one. Instead every
 * `DndContext` the page mounts is recorded and a test fires its `onDragEnd` directly — the
 * boundary through which dnd-kit itself reports a finished gesture.
 *
 * Wire it up at the top of a test file, before any import of the component under test:
 *
 *   const drags = await vi.hoisted(() => import('@/test/dnd').then((m) => m.captureDrags()))
 *   vi.mock('@dnd-kit/core', (importOriginal) => drags.mockDndKit(importOriginal))
 */
export function captureDrags() {
  const contexts: Captured[] = []
  let renders = 0

  const handlerOf = (entry: Captured | undefined): DragEnd => {
    if (!entry?.props.onDragEnd) throw new Error('No matching DndContext with an onDragEnd')
    return entry.props.onDragEnd
  }
  const latestMatching = (match: (props: DndContextProps) => boolean) =>
    handlerOf(contexts.filter((c) => match(c.props)).sort((a, b) => b.renderedAt - a.renderedAt)[0])

  return {
    /** The nth `DndContext` to mount, nested ones following their parent, as last rendered. */
    at(index: number): DragEnd {
      return handlerOf(contexts[index])
    },
    /** The most recently rendered `DndContext` whose props satisfy `match`. */
    find(match: (props: DndContextProps) => boolean): DragEnd {
      return latestMatching(match)
    },
    /** The most recently rendered `DndContext`. */
    latest(): DragEnd {
      return latestMatching(() => true)
    },
    async mockDndKit(
      importOriginal: () => Promise<unknown>,
    ): Promise<Omit<DndKit, 'DndContext'> & { DndContext: FC<DndContextProps> }> {
      const original = (await importOriginal()) as DndKit
      return {
        ...original,
        DndContext: (props) => {
          const id = useId()
          const entry = contexts.find((c) => c.id === id)
          if (entry) Object.assign(entry, { props, renderedAt: ++renders })
          else contexts.push({ id, props, renderedAt: ++renders })
          return <original.DndContext {...props} />
        },
      }
    },
  }
}
