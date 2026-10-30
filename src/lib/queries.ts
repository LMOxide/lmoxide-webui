import { useQuery } from "@tanstack/react-query"

import { api, unwrap } from "@/api/client"

/** Playfield id → name; public and fixed, so fetched once. */
export function usePlayfields() {
  return useQuery({
    queryKey: ["playfields"],
    queryFn: async () => {
      const list = await unwrap(api.GET("/v1/playfields"))
      return new Map(list.map((p) => [p.id, p.name]))
    },
    staleTime: Infinity,
    gcTime: Infinity,
  })
}

export function useStatus() {
  return useQuery({
    queryKey: ["status"],
    queryFn: () => unwrap(api.GET("/v1/status")),
    refetchInterval: 15_000,
  })
}

/** How the API is set up (registration, GM level thresholds); public, rarely changes. */
export function useConfig() {
  return useQuery({
    queryKey: ["config"],
    queryFn: () => unwrap(api.GET("/v1/config")),
    staleTime: 5 * 60_000,
  })
}

// game data: public, cacheable for an hour, fixed while the server runs
const GAME_DATA = { staleTime: 60 * 60_000, gcTime: Infinity } as const

/** Minifigure item template id → name, attacks, upgrade names by bit, parts. */
export function useMinifigures() {
  return useQuery({
    queryKey: ["minifigures"],
    queryFn: async () => {
      const list = await unwrap(api.GET("/v1/minifigures"))
      return new Map(list.map((m) => [m.id, m]))
    },
    ...GAME_DATA,
  })
}

/** Token id → name, location and minifigure. */
export function useTokens() {
  return useQuery({
    queryKey: ["tokens"],
    queryFn: async () => {
      const list = await unwrap(api.GET("/v1/tokens"))
      return new Map(list.map((t) => [t.id, t]))
    },
    ...GAME_DATA,
  })
}

/** GM levels from which accounts are contributors (the world editor) and sessions get the moderate
 * and admin scopes (server defaults until loaded); 1 to the contributors' are alpha testers. */
export function useGmLevels() {
  const { data } = useConfig()
  return { contributor: data?.editor_gm_level ?? 2, moderator: data?.moderator_gm_level ?? 3, admin: data?.admin_gm_level ?? 4 }
}
