import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const country = searchParams.get('country')

  const groups = await prisma.localGroup.findMany({
    where: country ? { country } : undefined,
    orderBy: [{ country: 'asc' }, { name: 'asc' }],
  })

  return NextResponse.json({ groups })
}
