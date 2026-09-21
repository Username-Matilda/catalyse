import Button from '@/components/Button'

/** What a detail page shows when its item doesn't exist or isn't visible to the viewer. */
export default function NotFoundCard({
  title,
  message,
  children,
}: {
  title: string
  message: string
  /** A way back more specific than the dashboard, such as the parent project. */
  children?: React.ReactNode
}) {
  return (
    <main className="container py-5 pb-15">
      <div className="max-w-[400px] my-15 mx-auto text-center">
        <h1>{title}</h1>
        <p className="text-text-light mb-8">{message}</p>
        <div className="flex flex-col gap-3 items-center">
          <Button href="/dashboard">Go to dashboard</Button>
          {children}
        </div>
      </div>
    </main>
  )
}
