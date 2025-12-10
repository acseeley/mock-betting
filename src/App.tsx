import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from './supabaseClient'
import { fetchNflSpreadsDraftKings } from './oddsApi'
import type { NflSpreadGame, SpreadSide } from './oddsApi'

type UserRow = {
  id: string
  username: string
  display_name: string | null
  starting_balance: number
  current_balance: number
}

type TransactionInsert = {
  user_id: string
  type: string
  amount: number
  balance_after: number
  bet_id?: string | null
}

type GameInfo = {
  home_team: string
  away_team: string
}

type GameRow = {
  id: string
  season: number
  week: number
  home_team: string
  away_team: string
  kickoff_at: string
  external_game_id: string | null
}

type BetRow = {
  id: string
  user_id: string
  game_id: string
  side: 'HOME' | 'AWAY'
  team_name: string
  spread_line: number
  odds_american: number
  stake: number
  status: 'PENDING' | 'WON' | 'LOST' | 'PUSH' | string
  placed_at: string
  settled_at: string | null
  payout: number | null
  profit: number | null
  fair_profit: number | null
  fair_payout: number | null
  game: GameInfo | null
}

type BetInsert = {
  user_id: string
  game_id: string
  side: 'HOME' | 'AWAY'
  team_name: string
  spread_line: number
  odds_american: number
  stake: number
}

type SelectedBet = {
  game: NflSpreadGame
  side: 'HOME' | 'AWAY'
  spread: SpreadSide
}

type SettleResult = 'WON' | 'LOST' | 'PUSH'

function calculateProfit(stake: number, odds: number): number {
  if (odds > 0) {
    return stake * (odds / 100)
  } else {
    return stake * (100 / Math.abs(odds))
  }
}

function getSpreadExplanation(bet: BetRow): string {
  if (!bet.game) return ''
  const home = bet.game.home_team
  const away = bet.game.away_team
  const line = bet.spread_line
  const absLine = Math.abs(line)
  const lineStr = line > 0 ? `+${line}` : `${line}`
  const betTeam = bet.side === 'HOME' ? home : away
  const oppTeam = bet.side === 'HOME' ? away : home

  if (line === 0) {
    return `You bet ${betTeam} (pick'em). If ${betTeam} win, select WON. If ${oppTeam} win, select LOST. If the game ends tied, select PUSH.`
  }

  if (line < 0) {
    const hasHook = absLine % 1 !== 0
    if (hasHook) {
      const needed = Math.floor(absLine) + 1
      return `You bet ${betTeam} ${lineStr}. If ${betTeam} win by ${needed} or more points, select WON. If ${oppTeam} win or ${betTeam} win by ${needed - 1} or fewer, select LOST.`
    } else {
      return `You bet ${betTeam} ${lineStr}. If ${betTeam} win by more than ${absLine} points, select WON. If they win by exactly ${absLine}, select PUSH. If they win by fewer than ${absLine} points or lose, select LOST.`
    }
  } else {
    const hasHook = absLine % 1 !== 0
    if (hasHook) {
      const maxLose = Math.floor(absLine)
      const bust = maxLose + 1
      return `You bet ${betTeam} ${lineStr}. If ${betTeam} win or lose by ${maxLose} points or fewer, select WON. If they lose by ${bust} or more, select LOST.`
    } else {
      return `You bet ${betTeam} ${lineStr}. If ${betTeam} win or lose by fewer than ${absLine} points, select WON. If they lose by exactly ${absLine}, select PUSH. If they lose by more than ${absLine}, select LOST.`
    }
  }
}

function App() {
  const [username, setUsername] = useState<string>('')
  const [currentUser, setCurrentUser] = useState<UserRow | null>(null)
  const [users, setUsers] = useState<UserRow[]>([])
  const [loadingUser, setLoadingUser] = useState<boolean>(false)
  const [error, setError] = useState<string>('')

  const [games, setGames] = useState<NflSpreadGame[]>([])
  const [loadingOdds, setLoadingOdds] = useState<boolean>(false)
  const [oddsError, setOddsError] = useState<string>('')

  const [selectedBet, setSelectedBet] = useState<SelectedBet | null>(null)
  const [stakeInput, setStakeInput] = useState<string>('')
  const [betError, setBetError] = useState<string>('')
  const [placingBet, setPlacingBet] = useState<boolean>(false)

  const [myBets, setMyBets] = useState<BetRow[]>([])
  const [settlingBetId, setSettlingBetId] = useState<string | null>(null)
  const [showFairBalance, setShowFairBalance] = useState<boolean>(false)

  const fetchUsers = async () => {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .order('current_balance', { ascending: false })

    if (error) {
      setError(error.message)
      return
    }

    setUsers((data as UserRow[]) || [])
  }

  const fetchMyBets = async (userId: string) => {
    const { data, error } = await supabase
      .from('bets')
      .select('*, game:games(home_team, away_team)')
      .eq('user_id', userId)
      .order('placed_at', { ascending: false })

    if (error) {
      setBetError(error.message)
      return
    }

    setMyBets((data as BetRow[]) || [])
  }

  const loadOdds = async () => {
    try {
      setLoadingOdds(true)
      setOddsError('')
      const data = await fetchNflSpreadsDraftKings()
      setGames(data)
    } catch (err: any) {
      setOddsError(err.message ?? 'Failed to load odds')
    } finally {
      setLoadingOdds(false)
    }
  }

  useEffect(() => {
    fetchUsers()
    loadOdds()
  }, [])

  useEffect(() => {
    if (currentUser) {
      fetchMyBets(currentUser.id)
    } else {
      setMyBets([])
    }
  }, [currentUser?.id])

  const loginWithUsername = async (rawName: string) => {
    const trimmed = rawName.trim()
    if (!trimmed) return

    setLoadingUser(true)
    setError('')

    const { data: existing, error: selectError } = await supabase
      .from('users')
      .select('*')
      .eq('username', trimmed)
      .maybeSingle()

    if (selectError) {
      setError(selectError.message)
      setLoadingUser(false)
      return
    }

    if (existing) {
      const user = existing as UserRow
      setCurrentUser(user)
      await fetchMyBets(user.id)
      setLoadingUser(false)
      return
    }

    const { data: inserted, error: insertError } = await supabase
      .from('users')
      .insert({
        username: trimmed,
        display_name: trimmed
      })
      .select()
      .single()

    if (insertError || !inserted) {
      setError(insertError?.message || 'Failed to create user')
      setLoadingUser(false)
      return
    }

    const newUser = inserted as UserRow
    setCurrentUser(newUser)

    const tx: TransactionInsert = {
      user_id: newUser.id,
      type: 'INITIAL',
      amount: newUser.starting_balance,
      balance_after: newUser.current_balance
    }

    await supabase.from('transactions').insert(tx)

    await fetchUsers()
    await fetchMyBets(newUser.id)
    setLoadingUser(false)
  }

  useEffect(() => {
  const rawHash = window.location.hash
  if (!rawHash) return

  const cleaned = rawHash.replace(/^#\/?/, '')
  const segments = cleaned.split('/').filter(Boolean)
  const fromUrl = segments[0]

  if (fromUrl) {
    const decoded = decodeURIComponent(fromUrl)
    setUsername(decoded)
    loginWithUsername(decoded)
  }
}, [])

useEffect(() => {
  const pathSegments = window.location.pathname.split('/').filter(Boolean);
  const usernameFromPath = pathSegments[pathSegments.length - 1];

  if (usernameFromPath && usernameFromPath !== 'mock-betting') {
    const decoded = decodeURIComponent(usernameFromPath);
    setUsername(decoded);
    loginWithUsername(decoded);
  }
}, []);


  const handleLogin = async (e: FormEvent) => {
    e.preventDefault()
    await loginWithUsername(username)
  }

  const openBetSlip = (game: NflSpreadGame, side: 'HOME' | 'AWAY') => {
    if (!currentUser) {
      setBetError('Log in first to place a bet.')
      return
    }

    const spread = side === 'HOME' ? game.homeSpread : game.awaySpread
    if (!spread) {
      setBetError('No spread available for that side.')
      return
    }

    setBetError('')
    setStakeInput('')
    setSelectedBet({ game, side, spread })
  }

  const ensureGameInDb = async (game: NflSpreadGame): Promise<GameRow> => {
    const { data: existing, error: selectError } = await supabase
      .from('games')
      .select('*')
      .eq('external_game_id', game.id)
      .maybeSingle()

    if (selectError) {
      throw new Error(selectError.message)
    }

    if (existing) {
      return existing as GameRow
    }

    const kickoff = new Date(game.commenceTime)
    const season = kickoff.getFullYear()
    const week = 0

    const { data: inserted, error: insertError } = await supabase
      .from('games')
      .insert({
        season,
        week,
        home_team: game.homeTeam,
        away_team: game.awayTeam,
        kickoff_at: kickoff.toISOString(),
        external_game_id: game.id
      })
      .select()
      .single()

    if (insertError || !inserted) {
      throw new Error(insertError?.message || 'Failed to insert game')
    }

    return inserted as GameRow
  }

  const handlePlaceBet = async () => {
    if (!currentUser || !selectedBet) return

    const parsedStake = parseFloat(stakeInput)
    if (isNaN(parsedStake) || parsedStake <= 0) {
      setBetError('Enter a valid stake.')
      return
    }

    if (parsedStake > currentUser.current_balance) {
      setBetError('Stake exceeds your current balance.')
      return
    }

    setPlacingBet(true)
    setBetError('')

    try {
      const gameRow = await ensureGameInDb(selectedBet.game)

      const betInsert: BetInsert = {
        user_id: currentUser.id,
        game_id: gameRow.id,
        side: selectedBet.side,
        team_name: selectedBet.spread.teamName,
        spread_line: selectedBet.spread.point,
        odds_american: selectedBet.spread.price,
        stake: parsedStake
      }

      const { data: betData, error: betError } = await supabase
        .from('bets')
        .insert(betInsert)
        .select()
        .single()

      if (betError || !betData) {
        throw new Error(betError?.message || 'Failed to insert bet')
      }

      const newBalance = currentUser.current_balance - parsedStake

      const tx: TransactionInsert = {
        user_id: currentUser.id,
        bet_id: betData.id,
        type: 'BET_PLACED',
        amount: -parsedStake,
        balance_after: newBalance
      }

      const { error: txError } = await supabase.from('transactions').insert(tx)
      if (txError) {
        throw new Error(txError.message)
      }

      const { data: updatedUser, error: userUpdateError } = await supabase
        .from('users')
        .update({ current_balance: newBalance })
        .eq('id', currentUser.id)
        .select()
        .single()

      if (userUpdateError || !updatedUser) {
        throw new Error(userUpdateError?.message || 'Failed to update user balance')
      }

      setCurrentUser(updatedUser as UserRow)
      await fetchUsers()
      await fetchMyBets(currentUser.id)
      setSelectedBet(null)
      setStakeInput('')
    } catch (err: any) {
      setBetError(err.message ?? 'Failed to place bet')
    } finally {
      setPlacingBet(false)
    }
  }

  const handleSettleBet = async (bet: BetRow, result: SettleResult) => {
    if (!currentUser) {
      setBetError('Log in first to settle bets.')
      return
    }

    if (bet.status !== 'PENDING') {
      setBetError('Bet is already settled.')
      return
    }

    setSettlingBetId(bet.id)
    setBetError('')

    try {
      let payout = 0
      let profit = 0

      if (result === 'WON') {
        const rawProfit = calculateProfit(bet.stake, bet.odds_american)
        profit = Number(rawProfit.toFixed(2))
        payout = bet.stake + profit
      } else if (result === 'LOST') {
        profit = -bet.stake
        payout = 0
      } else if (result === 'PUSH') {
        profit = 0
        payout = bet.stake
      }

      let fairProfit = 0
      let fairPayout = 0

      if (result === 'WON') {
        fairProfit = bet.stake
        fairPayout = bet.stake + fairProfit
      } else if (result === 'LOST') {
        fairProfit = -bet.stake
        fairPayout = 0
      } else if (result === 'PUSH') {
        fairProfit = 0
        fairPayout = bet.stake
      }

      const { data: updatedBet, error: betUpdateError } = await supabase
        .from('bets')
        .update({
          status: result,
          payout,
          profit,
          fair_profit: fairProfit,
          fair_payout: fairPayout,
          settled_at: new Date().toISOString()
        })
        .eq('id', bet.id)
        .select()
        .single()

      if (betUpdateError || !updatedBet) {
        throw new Error(betUpdateError?.message || 'Failed to update bet')
      }

      const amount = payout
      const newBalance = currentUser.current_balance + amount

      const tx: TransactionInsert = {
        user_id: currentUser.id,
        bet_id: bet.id,
        type: 'BET_SETTLED',
        amount,
        balance_after: newBalance
      }

      const { error: txError } = await supabase.from('transactions').insert(tx)
      if (txError) {
        throw new Error(txError.message)
      }

      const { data: updatedUser, error: userUpdateError } = await supabase
        .from('users')
        .update({ current_balance: newBalance })
        .eq('id', currentUser.id)
        .select()
        .single()

      if (userUpdateError || !updatedUser) {
        throw new Error(userUpdateError?.message || 'Failed to update user balance')
      }

      setCurrentUser(updatedUser as UserRow)
      await fetchUsers()
      await fetchMyBets(currentUser.id)
    } catch (err: any) {
      setBetError(err.message ?? 'Failed to settle bet')
    } finally {
      setSettlingBetId(null)
    }
  }

  let fairBalance: number | null = null
  if (currentUser) {
    const fairProfitSum = myBets
      .filter((b) => b.fair_profit != null)
      .reduce((sum, b) => sum + (b.fair_profit ?? 0), 0)
    fairBalance = currentUser.starting_balance + fairProfitSum
  }

  return (
    <main className="container" style={{ padding: '1.5rem', maxWidth: 1000, margin: '0 auto' }}>
      <h1>Mock NFL Betting</h1>

      <section style={{ marginBottom: '1.5rem' }}>
        <form
          onSubmit={handleLogin}
          style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}
        >
          <input
            type="text"
            placeholder="Enter username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <button type="submit" disabled={loadingUser}>
            {loadingUser ? 'Loading...' : 'Join / Login'}
          </button>
        </form>

        {currentUser && (
          <div style={{ marginTop: '0.5rem' }}>
            <p>
              Logged in as <strong>{currentUser.display_name || currentUser.username}</strong> · Balance{' '}
              {currentUser.current_balance.toFixed(2)}
            </p>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.9rem' }}>
              <input
                type="checkbox"
                checked={showFairBalance}
                onChange={(e) => setShowFairBalance(e.target.checked)}
              />
              Show fair balance (no vig)
            </label>
            {showFairBalance && fairBalance != null && (
              <p style={{ marginTop: '0.25rem', fontSize: '0.9rem', color: '#555' }}>
                Fair balance (if spreads were even money): {fairBalance.toFixed(2)}
              </p>
            )}
          </div>
        )}

        {error && (
          <p style={{ color: 'red', marginTop: '0.5rem' }}>
            {error}
          </p>
        )}
      </section>

      <section style={{ marginBottom: '2rem' }}>
        <h2>Leaderboard</h2>
        {users.length === 0 && <p>No users yet.</p>}
        {users.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc', padding: '0.25rem' }}>User</th>
                <th style={{ textAlign: 'right', borderBottom: '1px solid #ccc', padding: '0.25rem' }}>Balance</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td style={{ padding: '0.25rem', borderBottom: '1px solid #eee' }}>
                    {u.display_name || u.username}
                  </td>
                  <td style={{ padding: '0.25rem', textAlign: 'right', borderBottom: '1px solid #eee' }}>
                    {u.current_balance.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {currentUser ? (
        <section style={{ marginBottom: '2rem' }}>
          <h2>My Bets</h2>
          {myBets.length === 0 && <p>No bets yet.</p>}
          {myBets.length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc', padding: '0.25rem' }}>Placed</th>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc', padding: '0.25rem' }}>Side</th>
                  <th style={{ textAlign: 'right', borderBottom: '1px solid #ccc', padding: '0.25rem' }}>Stake</th>
                  <th style={{ textAlign: 'right', borderBottom: '1px solid #ccc', padding: '0.25rem' }}>Line</th>
                  <th style={{ textAlign: 'right', borderBottom: '1px solid #ccc', padding: '0.25rem' }}>Odds</th>
                  <th style={{ textAlign: 'center', borderBottom: '1px solid #ccc', padding: '0.25rem' }}>Status</th>
                  <th style={{ textAlign: 'center', borderBottom: '1px solid #ccc', padding: '0.25rem' }}>Settle</th>
                </tr>
              </thead>
              <tbody>
                {myBets.map((b) => {
                  const expl = getSpreadExplanation(b)
                  return (
                    <tr key={b.id}>
                      <td style={{ padding: '0.25rem', borderBottom: '1px solid #eee' }}>
                        {new Date(b.placed_at).toLocaleString()}
                      </td>
                      <td style={{ padding: '0.25rem', borderBottom: '1px solid #eee' }}>
                        {b.team_name} ({b.side})
                      </td>
                      <td style={{ padding: '0.25rem', textAlign: 'right', borderBottom: '1px solid #eee' }}>
                        {b.stake.toFixed(2)}
                      </td>
                      <td style={{ padding: '0.25rem', textAlign: 'right', borderBottom: '1px solid #eee' }}>
                        {b.spread_line > 0 ? `+${b.spread_line}` : b.spread_line}
                      </td>
                      <td style={{ padding: '0.25rem', textAlign: 'right', borderBottom: '1px solid #eee' }}>
                        {b.odds_american > 0 ? `+${b.odds_american}` : b.odds_american}
                      </td>
                      <td style={{ padding: '0.25rem', textAlign: 'center', borderBottom: '1px solid #eee' }}>
                        {b.status}
                      </td>
                      <td style={{ padding: '0.25rem', textAlign: 'center', borderBottom: '1px solid #eee' }}>
                        {b.status === 'PENDING' ? (
                          <div style={{ display: 'flex', gap: '0.25rem', justifyContent: 'center' }}>
                            <button
                              disabled={settlingBetId === b.id}
                              onClick={() => handleSettleBet(b, 'WON')}
                              title={expl}
                            >
                              Won
                            </button>
                            <button
                              disabled={settlingBetId === b.id}
                              onClick={() => handleSettleBet(b, 'LOST')}
                              title={expl}
                            >
                              Lost
                            </button>
                            <button
                              disabled={settlingBetId === b.id}
                              onClick={() => handleSettleBet(b, 'PUSH')}
                              title={expl}
                            >
                              Push
                            </button>
                          </div>
                        ) : (
                          '-'
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
          {betError && (
            <p style={{ color: 'red', marginTop: '0.5rem' }}>
              {betError}
            </p>
          )}
        </section>
      ) : (
        <p>Log in to see your bets.</p>
      )}

      <section style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
          <h2>Upcoming NFL Spreads (DraftKings)</h2>
          <button onClick={loadOdds} disabled={loadingOdds}>
            {loadingOdds ? 'Refreshing...' : 'Refresh Odds'}
          </button>
        </div>

        {oddsError && (
          <p style={{ color: 'red', marginTop: '0.5rem' }}>
            {oddsError}
          </p>
        )}

        {games.length === 0 && !loadingOdds && <p>No games returned.</p>}

        <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {games.map((g) => (
            <div
              key={g.id}
              style={{
                border: '1px solid #ddd',
                borderRadius: 4,
                padding: '0.5rem 0.75rem'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <div>
                  <strong>
                    {g.awayTeam} @ {g.homeTeam}
                  </strong>
                  <div style={{ fontSize: '0.85rem', color: '#555' }}>
                    {new Date(g.commenceTime).toLocaleString()}
                  </div>
                </div>
                <div style={{ fontSize: '0.85rem', color: '#555' }}>{g.bookmaker}</div>
              </div>

              <div
                style={{
                  marginTop: '0.4rem',
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '0.5rem',
                  fontSize: '0.9rem'
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                    <div>{g.awaySpread?.teamName ?? g.awayTeam}</div>
                    {g.awaySpread && (
                      <button onClick={() => openBetSlip(g, 'AWAY')}>
                        Bet Away
                      </button>
                    )}
                  </div>
                  {g.awaySpread ? (
                    <div>
                      Spread {g.awaySpread.point > 0 ? `+${g.awaySpread.point}` : g.awaySpread.point} · Odds{' '}
                      {g.awaySpread.price > 0 ? `+${g.awaySpread.price}` : g.awaySpread.price}
                    </div>
                  ) : (
                    <div>No spread</div>
                  )}
                </div>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                    <div>{g.homeSpread?.teamName ?? g.homeTeam}</div>
                    {g.homeSpread && (
                      <button onClick={() => openBetSlip(g, 'HOME')}>
                        Bet Home
                      </button>
                    )}
                  </div>
                  {g.homeSpread ? (
                    <div>
                      Spread {g.homeSpread.point > 0 ? `+${g.homeSpread.point}` : g.homeSpread.point} · Odds{' '}
                      {g.homeSpread.price > 0 ? `+${g.homeSpread.price}` : g.homeSpread.price}
                    </div>
                  ) : (
                    <div>No spread</div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {selectedBet && (
        <section
          style={{
            position: 'sticky',
            bottom: 0,
            background: '#f7f7f7',
            borderTop: '1px solid #ddd',
            padding: '0.75rem',
            marginTop: '1rem'
          }}
        >
          <h3>Bet Slip</h3>
          <p>
            {selectedBet.game.awayTeam} @ {selectedBet.game.homeTeam}
          </p>
          <p>
            Side{' '}
            {selectedBet.side === 'HOME'
              ? selectedBet.game.homeTeam
              : selectedBet.game.awayTeam}{' '}
            · Spread{' '}
            {selectedBet.spread.point > 0
              ? `+${selectedBet.spread.point}`
              : selectedBet.spread.point}{' '}
            · Odds{' '}
            {selectedBet.spread.price > 0
              ? `+${selectedBet.spread.price}`
              : selectedBet.spread.price}
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
            <input
              type="number"
              min="0"
              step="1"
              placeholder="Stake"
              value={stakeInput}
              onChange={(e) => setStakeInput(e.target.value)}
            />
            <button onClick={handlePlaceBet} disabled={placingBet || !currentUser}>
              {placingBet ? 'Placing...' : 'Place Bet'}
            </button>
            <button type="button" onClick={() => setSelectedBet(null)}>
              Cancel
            </button>
          </div>
          {betError && (
            <p style={{ color: 'red', marginTop: '0.5rem' }}>
              {betError}
            </p>
          )}
        </section>
      )}
    </main>
  )
}

export default App
