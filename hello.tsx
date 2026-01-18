import React from 'react'
import CSS from 'tailwindcss'
import Header from '../components/Header'
import Sidebar from '../components/Sidebar'
import Dashboard from '../components/Dashboard/Dashboard'
import InventoryTable from '../components/Inventory/InventoryTable'
import OrdersList from '../components/Orders/OrdersList'
import SalesPanel from '../components/Sales/SalesPanel'
import DailyHistory from '../components/History/DailyHistory'
import { Item, Order } from '../types'

function uid(prefix = '') {
    return prefix + Math.random().toString(36).slice(2, 9)
}

function todayKey() {
    const d = new Date()
    return d.toISOString().slice(0, 10)
}

interface DaySummary {
    date: string
    income: number
    sold: number
    ordersCount: number
    itemsLeft: number
}

// Added missing interface for the sales state
interface Sale {
    id: string
    itemId: string
    qty: number
    total: number
    date: string
}

interface PersistState {
    date: string
    dailyIncome: number
    dailySold: number
    history: DaySummary[]
    items: Item[]
    orders: Order[]
    // Ideally sales should be persisted too, but keeping it minimal to fix bugs
}

export default function HomePage() {
    const STORAGE_KEY = 'clothshop_state_v1'

    const [tab, setTab] = React.useState<string>('dashboard')

    const [items, setItems] = React.useState<Item[]>(() => [
        { id: 'i1', name: 'Classic Tee', price: 19.99, stock: 50, sold: 8 },
        { id: 'i2', name: 'Denim Jacket', price: 59.99, stock: 12, sold: 3 },
        { id: 'i3', name: 'Summer Dress', price: 39.5, stock: 25, sold: 5 },
    ])

    const [orders, setOrders] = React.useState<Order[]>(() => [
        {
            id: 'o1',
            customer: 'Alice',
            items: [{ itemId: 'i1', qty: 2 }],
            total: 39.98,
            received: false,
            createdAt: new Date().toISOString(),
        },
    ])

    // Added missing state for 'sales' which was used in render
    const [sales, setSales] = React.useState<Sale[]>([])

    const [dailyIncome, setDailyIncome] = React.useState<number>(0)
    const [dailySold, setDailySold] = React.useState<number>(0)
    const [history, setHistory] = React.useState<DaySummary[]>([])
    const [currentDate, setCurrentDate] = React.useState<string>(() => todayKey())

    React.useEffect(() => {
        const payload: PersistState = {
            date: currentDate,
            dailyIncome,
            dailySold,
            history,
            items,
            orders,
        }
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
        } catch (e) {
            console.warn('Failed to persist state', e)
        }
    }, [currentDate, dailyIncome, dailySold, history, items, orders])

    React.useEffect(() => {
        try {
            const raw = localStorage.getItem(STORAGE_KEY)
            if (!raw) return
            const parsed: PersistState = JSON.parse(raw)
            if (parsed) {
                setItems(parsed.items || [])
                setOrders(parsed.orders || [])
                setHistory(parsed.history || [])
                const savedDate = parsed.date || ''
                const t = todayKey()

                if (savedDate === t) {
                    setCurrentDate(t)
                    setDailyIncome(parsed.dailyIncome || 0)
                    setDailySold(parsed.dailySold || 0)
                } else if (savedDate) {
                    const ordersForSavedDate = (parsed.orders || []).filter(
                        (o) => o.createdAt.slice(0, 10) === savedDate
                    ).length
                    const itemsLeftForSavedDate =
                        (parsed.items || []).reduce(
                            (s, it) => s + (typeof it.stock === 'number' ? it.stock : 0),
                            0
                        ) || 0
                    const daySummary: DaySummary = {
                        date: savedDate,
                        income: parsed.dailyIncome || 0,
                        sold: parsed.dailySold || 0,
                        ordersCount: ordersForSavedDate,
                        itemsLeft: itemsLeftForSavedDate,
                    }
                    setHistory((h) => [daySummary, ...(parsed.history || [])])
                    setCurrentDate(t)
                    setDailyIncome(0)
                    setDailySold(0)
                }
            }
        } catch (e) {
            console.warn('Failed to load persisted state', e)
        }
    }, [])

    React.useEffect(() => {
        let timeoutId: number | undefined
        let intervalId: number | undefined

        const doRollover = (oldDate: string, newDate: string) => {
            const ordersCount = orders.filter(
                (o) => o.createdAt.slice(0, 10) === oldDate
            ).length
            const itemsLeft = items.reduce(
                (s, it) => s + (typeof it.stock === 'number' ? it.stock : 0),
                0
            )
            const summary: DaySummary = {
                date: oldDate,
                income: dailyIncome,
                sold: dailySold,
                ordersCount,
                itemsLeft,
            }
            setHistory((h) => [summary, ...h])
            setDailyIncome(0)
            setDailySold(0)
            setCurrentDate(newDate)
        }

        const schedule = () => {
            const now = new Date()
            const tomorrow = new Date(now)
            tomorrow.setDate(now.getDate() + 1)
            tomorrow.setHours(0, 0, 0, 0)
            const msUntilMidnight = tomorrow.getTime() - now.getTime()

            timeoutId = window.setTimeout(() => {
                const newDate = todayKey()
                doRollover(currentDate, newDate)
                schedule()
            }, msUntilMidnight + 1000)

            intervalId = window.setInterval(() => {
                const t = todayKey()
                if (t !== currentDate) {
                    doRollover(currentDate, t)
                }
            }, 60000)
        }

        schedule()

        return () => {
            if (timeoutId) window.clearTimeout(timeoutId)
            if (intervalId) window.clearInterval(intervalId)
        }
    }, [currentDate, orders, dailyIncome, dailySold, items])

    function addItem(name: string, price: number, stock: number) {
        const newItem: Item = {
            id: uid('i'),
            name,
            price: Math.max(0, price),
            stock: Math.max(0, stock),
            sold: 0,
        }
        setItems((s) => [newItem, ...s])
    }

    function adjustStock(id: string, delta: number) {
        setItems((prev) =>
            prev.map((it) => {
                if (it.id !== id) return it
                const newStock = Math.max(0, it.stock + delta)
                return { ...it, stock: newStock }
            })
        )
    }

    function recordSale(itemId: string, qty: number) {
        // Fix: Calculate logic BEFORE setting state to avoid stale closure issues
        const product = items.find((i) => i.id === itemId)
        if (!product) return

        const sellQty = Math.min(product.stock, qty)

        if (sellQty > 0) {
            // 1. Update Inventory
            setItems((prev) =>
                prev.map((it) => {
                    if (it.id !== itemId) return it
                    return {
                        ...it,
                        stock: Math.max(0, it.stock - sellQty),
                        sold: it.sold + sellQty,
                    }
                })
            )

            // 2. Update Stats
            const amount = sellQty * product.price
            setDailyIncome((inc) => inc + amount)
            setDailySold((s) => s + sellQty)

            // 3. Add to Sales Log
            setSales(prev => [...prev, {
                id: uid('s'),
                itemId,
                qty: sellQty,
                total: amount,
                date: new Date().toISOString()
            }])
        }
    }

    function receiveOrder(orderId: string) {
        // Fix: Don't execute side effects inside setOrders reducer
        const targetOrder = orders.find(o => o.id === orderId)

        if (!targetOrder || targetOrder.received) return

        // 1. Update Items
        setItems(prevItems => {
            return prevItems.map(item => {
                const orderItem = targetOrder.items.find(oi => oi.itemId === item.id)
                if (!orderItem) return item

                // Deduct stock based on order qty (capped by current stock)
                const sellQty = Math.min(item.stock, orderItem.qty)
                return {
                    ...item,
                    stock: Math.max(0, item.stock - sellQty),
                    sold: item.sold + sellQty
                }
            })
        })

        // 2. Update Income/Stats
        setDailyIncome((inc) => inc + targetOrder.total)
        const soldCount = targetOrder.items.reduce((s, x) => s + x.qty, 0)
        setDailySold((s) => s + soldCount)

        // 3. Mark Order as Received
        setOrders((prev) =>
            prev.map((o) => o.id === orderId ? { ...o, received: true } : o)
        )
    }

    function createQuickOrder() {
        if (items.length === 0) return
        const first = items[0]
        const newOrder: Order = {
            id: uid('o'),
            customer: 'Walk-in',
            items: [{ itemId: first.id, qty: 1 }],
            total: first.price,
            received: false,
            createdAt: new Date().toISOString(),
        }
        setOrders((s) => [newOrder, ...s])
        setTab('orders')
    }

    return (
        <div className="min-h-screen bg-slate-50 flex">
            <Sidebar active={tab} onChange={setTab} />
            <div className="flex-1 flex flex-col">
                <Header onNewOrder={createQuickOrder} />
                <main className="flex-1 overflow-auto">
                    {tab === 'dashboard' && (
                        <>
                            <Dashboard
                                items={items}
                                orders={orders}
                                income={dailyIncome}
                                dailySold={dailySold}
                            />
                            <div className="p-6">
                                <DailyHistory history={history} />
                            </div>
                        </>
                    )}
                    {tab === 'inventory' && (
                        <InventoryTable
                            items={items}
                            onAdjustStock={adjustStock}
                            onAddItem={addItem}
                        />
                    )}
                    {tab === 'orders' && (
                        <OrdersList
                            orders={orders}
                            items={items}
                            onReceive={receiveOrder}
                        />
                    )}
                    {tab === 'sales' && (
                        <SalesPanel items={items} onSell={recordSale} sales={sales} />
                    )}
                </main>
            </div>
        </div>
    )
}