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
import { layoutApi, pickingApi } from '@/api/index.js'
import { useAuthStore } from '@/stores/auth'
import { List, MapLocation, ArrowRight } from '@element-plus/icons-vue'

const authStore = useAuthStore()
const statsLoading = ref(false)
const tasksLoading = ref(false)
const recentTasks = ref([])
const layoutData = ref(null)

const stats = computed(() => [
  { label: '货位总数', value: layoutData.value?.locations?.length || 0, icon: '📍', color: '#667eea' },
  { label: '已使用货位', value: layoutData.value?.locations?.filter(l => l.total_qty > 0).length || 0, icon: '📦', color: '#f093fb' },
  { label: '待处理任务', value: recentTasks.value.filter(t => t.status === 'pending').length, icon: '⏳', color: '#f5a623' },
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
    const [layoutRes, tasksRes] = await Promise.all([
      layoutApi.getActive().catch(() => ({ data: null })),
      pickingApi.listTasks({ limit: 8 }).catch(() => ({ data: [] })),
    ])
    layoutData.value = layoutRes.data
    recentTasks.value = tasksRes.data?.slice(0, 8) || []
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
.quick-icon { width: 44px; height: 44px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 20px; flex-shrink: 0; }
.quick-title { font-size: 14px; font-weight: 600; color: #1a1a2e; }
.quick-desc { font-size: 12px; color: #909399; margin-top: 2px; }
</style>
