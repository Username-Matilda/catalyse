/** What a page shows while it waits to know who the viewer is. */
export default function PageLoading() {
  return (
    <main className="container py-5 pb-15">
      <div role="status" className="text-center py-10 text-text-light">
        Loading…
      </div>
    </main>
  )
}
