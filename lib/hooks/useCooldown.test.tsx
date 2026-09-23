import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useCooldown } from './useCooldown'

describe('useCooldown', () => {
  afterEach(() => vi.useRealTimers())

  it('holds an id cooling until the time is up, independently of other ids', () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => useCooldown(2000))
    expect(result.current.isCooling(1)).toBe(false)

    act(() => result.current.start(1))
    act(() => vi.advanceTimersByTime(1000))
    act(() => result.current.start(2))
    expect(result.current.isCooling(1)).toBe(true)
    expect(result.current.isCooling(2)).toBe(true)

    act(() => vi.advanceTimersByTime(1000))
    expect(result.current.isCooling(1)).toBe(false)
    expect(result.current.isCooling(2)).toBe(true)

    act(() => vi.advanceTimersByTime(1000))
    expect(result.current.isCooling(2)).toBe(false)
  })

  it('defaults to two seconds', () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => useCooldown())
    act(() => result.current.start(7))
    act(() => vi.advanceTimersByTime(1999))
    expect(result.current.isCooling(7)).toBe(true)
    act(() => vi.advanceTimersByTime(1))
    expect(result.current.isCooling(7)).toBe(false)
  })
})
