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
