const ODDS_API_BASE = 'https://api.the-odds-api.com/v4'

export type SpreadSide = {
  teamName: string
  point: number
  price: number
}

export type NflSpreadGame = {
  id: string
  commenceTime: string
  homeTeam: string
  awayTeam: string
  bookmaker: string
  homeSpread: SpreadSide | null
  awaySpread: SpreadSide | null
}

export async function fetchNflSpreadsDraftKings(): Promise<NflSpreadGame[]> {
  const apiKey = import.meta.env.VITE_ODDS_API_KEY
  if (!apiKey) {
    throw new Error('Missing VITE_ODDS_API_KEY')
  }

  const url = new URL(
    `${ODDS_API_BASE}/sports/americanfootball_nfl/odds`
  )

  url.searchParams.set('apiKey', apiKey)
  url.searchParams.set('regions', 'us')
  url.searchParams.set('markets', 'spreads')
  url.searchParams.set('oddsFormat', 'american')
  url.searchParams.set('bookmakers', 'draftkings')

  const res = await fetch(url.toString())

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Odds API error ${res.status}: ${text}`)
  }

  const json = (await res.json()) as any[]

  const games: NflSpreadGame[] = json.map((game) => {
    const bookmaker = (game.bookmakers || []).find(
      (b: any) => b.key === 'draftkings'
    )

    if (!bookmaker) {
      return {
        id: game.id,
        commenceTime: game.commence_time,
        homeTeam: game.home_team,
        awayTeam: game.away_team,
        bookmaker: 'draftkings',
        homeSpread: null,
        awaySpread: null
      }
    }

    const spreadsMarket = (bookmaker.markets || []).find(
      (m: any) => m.key === 'spreads'
    )

    const outcomes = (spreadsMarket?.outcomes || []) as any[]

    const homeOutcome = outcomes.find(
      (o) => o.name === game.home_team
    )
    const awayOutcome = outcomes.find(
      (o) => o.name === game.away_team
    )

    const toSide = (o: any | undefined): SpreadSide | null =>
      o
        ? {
            teamName: o.name,
            point: o.point,
            price: o.price
          }
        : null

    return {
      id: game.id,
      commenceTime: game.commence_time,
      homeTeam: game.home_team,
      awayTeam: game.away_team,
      bookmaker: bookmaker.title || bookmaker.key,
      homeSpread: toSide(homeOutcome),
      awaySpread: toSide(awayOutcome)
    }
  })

  return games
}
