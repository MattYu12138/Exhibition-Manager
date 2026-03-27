<template>
  <div class="exhibition-list">
    <div class="page-header">
      <div>
        <h1 class="page-title">展会管理</h1>
        <p class="page-desc">管理所有展会的备货清单与库存盘点</p>
      </div>
      <el-button type="primary" size="large" @click="$router.push('/exhibitions/new')">
        <el-icon><Plus /></el-icon> 新建展会
      </el-button>
    </div>

    <!-- 统计卡片 -->
    <el-row :gutter="16" class="stats-row">
      <el-col :span="8">
        <el-card class="stat-card">
          <div class="stat-content">
            <div class="stat-icon preparing"><el-icon size="28"><Edit /></el-icon></div>
            <div>
              <div class="stat-num">{{ stats.preparing }}</div>
              <div class="stat-label">准备中</div>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="8">
        <el-card class="stat-card">
          <div class="stat-content">
            <div class="stat-icon active"><el-icon size="28"><Flag /></el-icon></div>
            <div>
              <div class="stat-num">{{ stats.active }}</div>
              <div class="stat-label">进行中</div>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="8">
        <el-card class="stat-card">
          <div class="stat-content">
            <div class="stat-icon completed"><el-icon size="28"><CircleCheck /></el-icon></div>
            <div>
              <div class="stat-num">{{ stats.completed }}</div>
              <div class="stat-label">已完成</div>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 展会列表 -->
    <el-card v-loading="store.loading">
      <template #header>
        <span style="font-weight: 600">所有展会</span>
      </template>

      <el-empty v-if="!store.exhibitions.length" description="暂无展会，点击右上角新建">
        <el-button type="primary" @click="$router.push('/exhibitions/new')">新建展会</el-button>
      </el-empty>

      <div v-else class="exhibition-grid">
        <el-card
          v-for="ex in store.exhibitions"
          :key="ex.id"
          class="ex-card"
          shadow="hover"
        >
          <div class="ex-card-header">
            <el-tag :type="statusType(ex.status)" size="small">{{ statusLabel(ex.status) }}</el-tag>
            <el-dropdown @command="(cmd) => handleCommand(cmd, ex)">
              <el-icon class="more-btn"><MoreFilled /></el-icon>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="edit">编辑</el-dropdown-item>
                  <el-dropdown-item command="delete" divided style="color: #f56c6c">删除</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>

          <div class="ex-card-body" @click="$router.push(`/exhibitions/${ex.id}`)">
            <h3 class="ex-name">{{ ex.name }}</h3>
            <div class="ex-meta">
              <span v-if="ex.date"><el-icon><Calendar /></el-icon> {{ ex.date }}</span>
              <span v-if="ex.location"><el-icon><Location /></el-icon> {{ ex.location }}</span>
            </div>
          </div>

          <div class="ex-card-footer">
            <el-button size="small" @click="$router.push(`/exhibitions/${ex.id}`)">查看详情</el-button>
            <el-button size="small" type="primary" @click="$router.push(`/exhibitions/${ex.id}/checklist`)">
              清点
            </el-button>
          </div>
        </el-card>
      </div>
    </el-card>

    <!-- 编辑对话框 -->
    <el-dialog v-model="editDialog" title="编辑展会" width="480px">
      <el-form :model="editForm" label-width="80px">
        <el-form-item label="展会名称" required>
          <el-input v-model="editForm.name" placeholder="请输入展会名称" />
        </el-form-item>
        <el-form-item label="日期">
          <el-input v-model="editForm.date" placeholder="如：2024-03-15" />
        </el-form-item>
        <el-form-item label="地点">
          <el-input v-model="editForm.location" placeholder="展会地点" />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="editForm.status">
            <el-option label="准备中" value="preparing" />
            <el-option label="进行中" value="active" />
            <el-option label="已完成" value="completed" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editDialog = false">取消</el-button>
        <el-button type="primary" @click="saveEdit">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessageBox } from 'element-plus'
import { useExhibitionStore } from '@/stores/exhibition'

const store = useExhibitionStore()
const editDialog = ref(false)
const editForm = ref({})
const editTarget = ref(null)

const stats = computed(() => ({
  preparing: store.exhibitions.filter((e) => e.status === 'preparing').length,
  active: store.exhibitions.filter((e) => e.status === 'active').length,
  completed: store.exhibitions.filter((e) => e.status === 'completed').length,
}))

const statusType = (s) => ({ preparing: 'info', active: 'warning', completed: 'success' }[s] || 'info')
const statusLabel = (s) => ({ preparing: '准备中', active: '进行中', completed: '已完成' }[s] || s)

function handleCommand(cmd, ex) {
  if (cmd === 'edit') {
    editTarget.value = ex
    editForm.value = { name: ex.name, date: ex.date, location: ex.location, status: ex.status }
    editDialog.value = true
  } else if (cmd === 'delete') {
    ElMessageBox.confirm(`确定要删除展会「${ex.name}」吗？此操作不可撤销。`, '删除确认', {
      type: 'warning',
      confirmButtonText: '删除',
      confirmButtonClass: 'el-button--danger',
    }).then(() => store.deleteExhibition(ex.id))
  }
}

async function saveEdit() {
  if (!editForm.value.name) return
  await store.updateExhibition(editTarget.value.id, editForm.value)
  editDialog.value = false
}

onMounted(() => store.loadExhibitions())
</script>

<style scoped>
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 24px;
}
.page-title { font-size: 24px; font-weight: 700; color: #1a1a2e; }
.page-desc { color: #909399; margin-top: 4px; font-size: 14px; }

.stats-row { margin-bottom: 20px; }
.stat-card { border-radius: 12px; }
.stat-content { display: flex; align-items: center; gap: 16px; padding: 8px 0; }
.stat-icon { width: 56px; height: 56px; border-radius: 12px; display: flex; align-items: center; justify-content: center; }
.stat-icon.preparing { background: #ecf5ff; color: #409eff; }
.stat-icon.active { background: #fdf6ec; color: #e6a23c; }
.stat-icon.completed { background: #f0f9eb; color: #67c23a; }
.stat-num { font-size: 28px; font-weight: 700; color: #303133; }
.stat-label { font-size: 13px; color: #909399; margin-top: 2px; }

.exhibition-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
}

.ex-card { cursor: default; transition: transform 0.2s; }
.ex-card:hover { transform: translateY(-2px); }
.ex-card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.more-btn { cursor: pointer; color: #909399; font-size: 18px; }
.ex-card-body { cursor: pointer; margin-bottom: 16px; }
.ex-name { font-size: 16px; font-weight: 600; color: #303133; margin-bottom: 8px; }
.ex-meta { display: flex; gap: 12px; font-size: 13px; color: #909399; flex-wrap: wrap; }
.ex-meta span { display: flex; align-items: center; gap: 4px; }
.ex-card-footer { display: flex; gap: 8px; justify-content: flex-end; }
</style>
