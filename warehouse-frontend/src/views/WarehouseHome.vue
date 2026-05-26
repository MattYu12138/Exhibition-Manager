<template>
  <div class="warehouse-home">
    <div class="page-header">
      <div>
        <h1 class="page-title">🏭 仓库总览</h1>
        <p class="page-subtitle">Warehouse Manager · 货位管理与拣货导航</p>
      </div>
      <div class="header-actions">
        <el-button type="primary" @click="$router.push('/picking')">
          <el-icon><List /></el-icon> 拣货任务
        </el-button>
        <el-button @click="$router.push('/map')">
          <el-icon><MapLocation /></el-icon> 查看地图
        </el-button>
      </div>
    </div>

    <!-- 可调拨提醒横幅 -->
    <div v-if="transferAlertCount > 0" class="transfer-banner" @click="$router.push('/locations')">
      <div class="banner-left">
        <span class="banner-icon">🔄</span>
        <div>
          <div class="banner-title">有货位可内部调拨</div>
          <div class="banner-desc">{{ transferAlertCount }} 个货位的备库有货可调拨到上架区，点击查看</div>
        </div>
      </div>
      <el-button type="success" size="small">立即处理 →</el-button>
    </div>

    <!-- 补货提醒横幅 -->
    <div v-if="pendingReplenishCount > 0" class="replenishment-banner" @click="$router.push('/replenishment')">
      <div class="banner-left">
        <span class="banner-icon">🚚</span>
        <div>
          <div class="banner-title">有新货物待补货</div>
          <div class="banner-desc">共 {{ pendingReplenishCount }} 条补货明细待确认，点击进入补货界面</div>
        </div>
      </div>
      <el-button type="warning" size="small">立即处理 →</el-button>
    </div>

    <!-- 统计卡片 -->
    <div class="stats-grid" v-loading="statsLoading">
      <div class="stat-card" v-for="stat in stats" :key="stat.label" :style="{ '--accent': stat.color }">
        <div class="stat-icon">{{ stat.icon }}</div>
        <div class="stat-body">
          <div class="stat-value">{{ stat.value }}</div>
          <div class="stat-label">{{ stat.label }}</div>
        </div>
      </div>
    </div>

    <el-row :gutter="20" style="margin-top: 20px">
      <!-- 最近拣货任务 -->
      <el-col :span="14">
        <el-card>
          <template #header>
            <div class="card-header">
              <span>最近拣货任务</span>
              <el-button text type="primary" @click="$router.push('/picking')">查看全部</el-button>
            </div>
          </template>
          <el-table :data="recentTasks" size="small" v-loading="tasksLoading">
            <el-table-column label="任务" min-width="160">
              <template #default="{ row }">
                <div class="task-name">
                  <el-tag size="small" :type="row.task_type === 'order' ? 'primary' : 'warning'" style="margin-right:6px">
                    {{ row.task_type === 'order' ? '订单' : '展会' }}
                  </el-tag>
                  {{ row.shopify_order_name || row.exhibition_name || row.id }}
                </div>
              </template>
            </el-table-column>
            <el-table-column label="进度" width="120">
              <template #default="{ row }">
                <el-progress
                  :percentage="row.total_lines ? Math.round(row.picked_lines / row.total_lines * 100) : 0"
                  :status="row.status === 'completed' ? 'success' : undefined"
                  :stroke-width="6"
                />
              </template>
            </el-table-column>
            <el-table-column label="状态" width="80">
              <template #default="{ row }">
                <el-tag size="small" :type="statusType(row.status)">{{ statusLabel(row.status) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="" width="60">
              <template #default="{ row }">
                <el-button text type="primary" size="small" @click="$router.push(`/picking/${row.id}`)">
                  <el-icon><ArrowRight /></el-icon>
                </el-button>
              </template>
            </el-table-column>
          </el-table>
          <el-empty v-if="!tasksLoading && recentTasks.length === 0" description="暂无拣货任务" :image-size="60" />
        </el-card>
      </el-col>

      <!-- 快捷操作 -->
      <el-col :span="10">
        <el-card>
          <template #header><span>快捷操作</span></template>
          <div class="quick-actions">
            <div class="quick-item" @click="$router.push('/replenishment')">
              <div class="quick-icon" style="background: linear-gradient(135deg, #f7971e, #ffd200)">
                🚚
                <span v-if="pendingReplenishCount > 0" class="badge">{{ pendingReplenishCount }}</span>
              </div>
              <div class="quick-text">
                <div class="quick-title">补货管理</div>
                <div class="quick-desc">处理 inbound 入库后的货位补货</div>
              </div>
            </div>
            <div class="quick-item" @click="$router.push('/picking')">
              <div class="quick-icon" style="background: linear-gradient(135deg, #667eea, #764ba2)">📦</div>
              <div class="quick-text">
                <div class="quick-title">创建拣货任务</div>
                <div class="quick-desc">从 Shopify 订单或展会备货</div>
              </div>
            </div>
            <div class="quick-item" @click="$router.push('/locations')">
              <div class="quick-icon" style="background: linear-gradient(135deg, #f093fb, #f5576c)">📍</div>
              <div class="quick-text">
                <div class="quick-title">货位管理</div>
                <div class="quick-desc">查看货位库存、录入货物</div>
              </div>
            </div>
            <div class="quick-item" @click="$router.push('/map')">
              <div class="quick-icon" style="background: linear-gradient(135deg, #4facfe, #00f2fe)">🗺️</div>
              <div class="quick-text">
                <div class="quick-title">仓库地图</div>
                <div class="quick-desc">可视化货位分布</div>
              </div>
            </div>
            <div v-if="authStore.isAdmin" class="quick-item" @click="$router.push('/map/builder')">
              <div class="quick-icon" style="background: linear-gradient(135deg, #43e97b, #38f9d7)">🔧</div>
              <div class="quick-text">
                <div class="quick-title">地图构建器</div>
                <div class="quick-desc">拖拽设计仓库布局</div>
              </div>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { layoutApi, pickingApi, replenishmentApi, locationApi } from '@/api/index.js'
import { useAuthStore } from '@/stores/auth'
import { List, MapLocation, ArrowRight } from '@element-plus/icons-vue'

const authStore = useAuthStore()
const statsLoading = ref(false)
const tasksLoading = ref(false)
const recentTasks = ref([])
const layoutData = ref(null)
const pendingReplenishCount = ref(0)
const transferAlertCount = ref(0)

const stats = computed(() => [
  { label: '货位总数', value: layoutData.value?.locations?.length || 0, icon: '📍', color: '#667eea' },
  { label: '已使用货位', value: layoutData.value?.locations?.filter(l => l.total_qty > 0).length || 0, icon: '📦', color: '#f093fb' },
  { label: '待补货', value: pendingReplenishCount.value, icon: '🚚', color: '#f7971e' },
  { label: '今日完成', value: recentTasks.value.filter(t => t.status === 'completed').length, icon: '✅', color: '#43e97b' },
])

function statusType(s) {
  return { pending: 'info', in_progress: 'warning', completed: 'success', cancelled: 'danger' }[s] || 'info'
}
function statusLabel(s) {
  return { pending: '待处理', in_progress: '进行中', completed: '已完成', cancelled: '已取消' }[s] || s
}

onMounted(async () => {
  statsLoading.value = true
  tasksLoading.value = true
  try {
    const [layoutRes, tasksRes, replenishRes, alertsRes] = await Promise.all([
      layoutApi.getActive().catch(() => ({ data: null })),
      pickingApi.listTasks({ limit: 8 }).catch(() => ({ data: [] })),
      replenishmentApi.getPendingCount().catch(() => ({ data: { count: 0 } })),
      locationApi.getAlerts().catch(() => ({ data: [] })),
    ])
    layoutData.value = layoutRes.data
    recentTasks.value = tasksRes.data?.slice(0, 8) || []
    pendingReplenishCount.value = replenishRes.data?.count || 0
    const alerts = alertsRes.data || []
    transferAlertCount.value = alerts.filter(a => a.transfer_available?.length > 0).length
  } finally {
    statsLoading.value = false
    tasksLoading.value = false
  }
})
</script>

<style scoped>
.warehouse-home { animation: fadeIn 0.3s ease; }
@keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }

.page-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 24px; }
.page-title { font-size: 24px; font-weight: 700; color: #1a1a2e; margin: 0 0 4px; }
.page-subtitle { color: #909399; font-size: 14px; }
.header-actions { display: flex; gap: 10px; }

/* 可调拨横幅 */
.transfer-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: linear-gradient(135deg, #d4edda, #c3e6cb);
  border: 1px solid #28a745;
  border-radius: 12px;
  padding: 14px 20px;
  margin-bottom: 12px;
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
}
.transfer-banner:hover { transform: translateY(-2px); box-shadow: 0 4px 16px rgba(40,167,69,0.3); }

/* 补货横幅 */
.replenishment-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: linear-gradient(135deg, #fff3cd, #ffe69c);
  border: 1px solid #ffc107;
  border-radius: 12px;
  padding: 14px 20px;
  margin-bottom: 20px;
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
}
.replenishment-banner:hover { transform: translateY(-2px); box-shadow: 0 4px 16px rgba(255,193,7,0.3); }
.banner-left { display: flex; align-items: center; gap: 14px; }
.banner-icon { font-size: 28px; }
.banner-title { font-size: 15px; font-weight: 700; color: #856404; }
.banner-desc { font-size: 13px; color: #997404; margin-top: 2px; }

.stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
.stat-card {
  background: #fff;
  border-radius: 12px;
  padding: 20px;
  display: flex;
  align-items: center;
  gap: 16px;
  box-shadow: 0 2px 12px rgba(0,0,0,0.08);
  border-left: 4px solid var(--accent);
  transition: transform 0.2s, box-shadow 0.2s;
}
.stat-card:hover { transform: translateY(-2px); box-shadow: 0 4px 20px rgba(0,0,0,0.12); }
.stat-icon { font-size: 28px; }
.stat-value { font-size: 28px; font-weight: 700; color: #1a1a2e; line-height: 1; }
.stat-label { font-size: 13px; color: #909399; margin-top: 4px; }

.card-header { display: flex; align-items: center; justify-content: space-between; }
.task-name { display: flex; align-items: center; font-size: 13px; }

.quick-actions { display: flex; flex-direction: column; gap: 12px; }
.quick-item {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px;
  border-radius: 10px;
  cursor: pointer;
  transition: background 0.2s, transform 0.15s;
  border: 1px solid #f0f0f0;
}
.quick-item:hover { background: #f8f9ff; transform: translateX(4px); }
.quick-icon {
  width: 44px; height: 44px; border-radius: 10px;
  display: flex; align-items: center; justify-content: center;
  font-size: 20px; flex-shrink: 0; position: relative;
}
.badge {
  position: absolute;
  top: -6px; right: -6px;
  background: #f56c6c;
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  border-radius: 10px;
  padding: 1px 5px;
  min-width: 16px;
  text-align: center;
  line-height: 14px;
}
.quick-title { font-size: 14px; font-weight: 600; color: #1a1a2e; }
.quick-desc { font-size: 12px; color: #909399; margin-top: 2px; }
</style>
