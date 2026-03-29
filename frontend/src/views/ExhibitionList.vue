<template>
  <div class="exhibition-list">
    <div class="page-header">
      <div>
        <h1 class="page-title">{{ t('exhibitionList.pageTitle') }}</h1>
        <p class="page-desc">{{ t('exhibitionList.pageDesc') }}</p>
      </div>
      <div class="header-actions">
        <LangSwitch />
        <el-button type="primary" size="large" @click="$router.push('/exhibitions/new')">
          <el-icon><Plus /></el-icon> {{ t('exhibitionList.newExhibition') }}
        </el-button>
      </div>
    </div>

    <!-- 统计卡片 -->
    <el-row :gutter="16" class="stats-row">
      <el-col :span="8">
        <el-card class="stat-card">
          <div class="stat-content">
            <div class="stat-icon preparing"><el-icon size="28"><Edit /></el-icon></div>
            <div>
              <div class="stat-num">{{ stats.preparing }}</div>
              <div class="stat-label">{{ t('exhibitionList.statPreparing') }}</div>
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
              <div class="stat-label">{{ t('exhibitionList.statActive') }}</div>
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
              <div class="stat-label">{{ t('exhibitionList.statCompleted') }}</div>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 展会列表 -->
    <el-card v-loading="store.loading">
      <template #header>
        <span style="font-weight: 600">{{ t('exhibitionList.allExhibitions') }}</span>
      </template>

      <el-empty v-if="!store.exhibitions.length" :description="t('exhibitionList.empty')">
        <el-button type="primary" @click="$router.push('/exhibitions/new')">{{ t('exhibitionList.newExhibition') }}</el-button>
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
                  <el-dropdown-item command="edit">{{ t('common.edit') }}</el-dropdown-item>
                  <el-dropdown-item command="delete" divided style="color: #f56c6c">{{ t('common.delete') }}</el-dropdown-item>
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
            <!-- 左侧：复制模版按钮 -->
            <el-button
              size="small"
              plain
              type="warning"
              class="copy-template-btn"
              @click.stop="openCopyDialog(ex)"
            >
              <el-icon><CopyDocument /></el-icon> {{ t('exhibitionList.copyTemplate') }}
            </el-button>

            <!-- 右侧：原有按钮 -->
            <div class="footer-right">
              <el-button size="small" @click="$router.push(`/exhibitions/${ex.id}`)">{{ t('exhibitionList.viewDetail') }}</el-button>
              <el-button size="small" type="primary" @click="goChecklist(ex)">
                {{ t('exhibitionList.checklist') }}
              </el-button>
            </div>
          </div>
        </el-card>
      </div>
    </el-card>

    <!-- 编辑对话框 -->
    <el-dialog v-model="editDialog" :title="t('exhibitionList.editDialogTitle')" width="480px">
      <el-form :model="editForm" label-width="80px">
        <el-form-item :label="t('exhibitionList.fieldName')" required>
          <el-input v-model="editForm.name" :placeholder="t('exhibitionList.namePlaceholder')" />
        </el-form-item>
        <el-form-item :label="t('exhibitionList.fieldDate')">
          <el-input v-model="editForm.date" :placeholder="t('exhibitionList.datePlaceholder')" />
        </el-form-item>
        <el-form-item :label="t('exhibitionList.fieldLocation')">
          <el-input v-model="editForm.location" :placeholder="t('exhibitionList.locationPlaceholder')" />
        </el-form-item>
        <el-form-item :label="t('exhibitionList.fieldStatus')">
          <el-select v-model="editForm.status">
            <el-option :label="t('exhibitionList.statusPreparing')" value="preparing" />
            <el-option :label="t('exhibitionList.statusActive')" value="active" />
            <el-option :label="t('exhibitionList.statusCompleted')" value="completed" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editDialog = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="saveEdit">{{ t('common.save') }}</el-button>
      </template>
    </el-dialog>

    <!-- 复制模版对话框 -->
    <el-dialog v-model="copyDialog" :title="t('exhibitionList.copyDialogTitle')" width="500px">
      <div class="copy-dialog-body">
        <div class="copy-source-info">
          <el-icon color="#e6a23c"><CopyDocument /></el-icon>
          <span>{{ t('exhibitionList.copyTo', { name: copySourceEx?.name }) }}</span>
        </div>

        <div class="copy-mode-tabs">
          <el-radio-group v-model="copyMode" size="large">
            <el-radio-button value="existing">{{ t('exhibitionList.copyModeExisting') }}</el-radio-button>
            <el-radio-button value="new">{{ t('exhibitionList.copyModeNew') }}</el-radio-button>
          </el-radio-group>
        </div>

        <!-- 选择已有展会 -->
        <div v-if="copyMode === 'existing'" class="copy-target-select">
          <el-select
            v-model="copyTargetId"
            :placeholder="t('exhibitionList.copySelectPlaceholder')"
            style="width: 100%"
            size="large"
          >
            <el-option
              v-for="ex in otherExhibitions"
              :key="ex.id"
              :label="`${ex.name}${ex.date ? '（' + ex.date + '）' : ''}`"
              :value="ex.id"
            />
          </el-select>
          <p class="copy-hint">{{ t('exhibitionList.copyHint') }}</p>
        </div>

        <!-- 新建展会 -->
        <div v-else class="copy-new-form">
          <el-form :model="copyNewForm" label-width="80px">
            <el-form-item :label="t('exhibitionList.fieldName')" required>
              <el-input v-model="copyNewForm.name" :placeholder="t('exhibitionList.copyNamePlaceholder')" />
            </el-form-item>
            <el-form-item :label="t('exhibitionList.fieldDate')">
              <el-date-picker
                v-model="copyNewForm.dateRange"
                type="daterange"
                range-separator="至"
                :start-placeholder="t('exhibitionCreate.dateStart')"
                :end-placeholder="t('exhibitionCreate.dateEnd')"
                format="YYYY-MM-DD"
                value-format="YYYY-MM-DD"
                style="width: 100%"
              />
            </el-form-item>
            <el-form-item :label="t('exhibitionList.fieldLocation')">
              <el-input v-model="copyNewForm.location" :placeholder="t('exhibitionList.copyLocationPlaceholder')" />
            </el-form-item>
          </el-form>
        </div>
      </div>

      <template #footer>
        <el-button @click="copyDialog = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="copyLoading" @click="confirmCopy">
          {{ t('exhibitionList.copyConfirm') }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ElMessageBox, ElMessage } from 'element-plus'
import { useExhibitionStore } from '@/stores/exhibition'
import { exhibitionApi } from '@/api'
import LangSwitch from '@/components/LangSwitch.vue'

const { t } = useI18n()
const store = useExhibitionStore()
const router = useRouter()
const editDialog = ref(false)
const editForm = ref({})
const editTarget = ref(null)

// 复制模版相关状态
const copyDialog = ref(false)
const copySourceEx = ref(null)
const copyMode = ref('existing')
const copyTargetId = ref(null)
const copyLoading = ref(false)
const copyNewForm = ref({ name: '', dateRange: null, location: '' })

const stats = computed(() => ({
  preparing: store.exhibitions.filter((e) => e.status === 'preparing').length,
  active: store.exhibitions.filter((e) => e.status === 'active').length,
  completed: store.exhibitions.filter((e) => e.status === 'completed').length,
}))

const otherExhibitions = computed(() =>
  store.exhibitions.filter((e) => e.id !== copySourceEx.value?.id)
)

const statusType = (s) => ({ preparing: 'info', active: 'warning', completed: 'success' }[s] || 'info')
const statusLabel = (s) => ({
  preparing: t('exhibitionList.statusPreparing'),
  active: t('exhibitionList.statusActive'),
  completed: t('exhibitionList.statusCompleted'),
}[s] || s)

function handleCommand(cmd, ex) {
  if (cmd === 'edit') {
    editTarget.value = ex
    editForm.value = { name: ex.name, date: ex.date, location: ex.location, status: ex.status }
    editDialog.value = true
  } else if (cmd === 'delete') {
    ElMessageBox.confirm(
      t('exhibitionList.deleteConfirmMsg', { name: ex.name }),
      t('exhibitionList.deleteConfirmTitle'),
      {
        type: 'warning',
        confirmButtonText: t('common.delete'),
        confirmButtonClass: 'el-button--danger',
      }
    ).then(() => store.deleteExhibition(ex.id))
  }
}

async function saveEdit() {
  if (!editForm.value.name) return
  await store.updateExhibition(editTarget.value.id, editForm.value)
  editDialog.value = false
}

function openCopyDialog(ex) {
  copySourceEx.value = ex
  copyMode.value = 'existing'
  copyTargetId.value = null
  copyNewForm.value = { name: `${ex.name}（副本）`, dateRange: null, location: ex.location || '' }
  copyDialog.value = true
}

async function confirmCopy() {
  copyLoading.value = true
  try {
    let targetId

    if (copyMode.value === 'existing') {
      if (!copyTargetId.value) {
        ElMessage.warning(t('exhibitionList.copySelectPlaceholder'))
        return
      }
      targetId = copyTargetId.value
    } else {
      if (!copyNewForm.value.name) {
        ElMessage.warning(t('exhibitionList.copyNamePlaceholder'))
        return
      }
      const dateStr = copyNewForm.value.dateRange
        ? `${copyNewForm.value.dateRange[0]} 至 ${copyNewForm.value.dateRange[1]}`
        : null
      const res = await exhibitionApi.create({
        name: copyNewForm.value.name,
        date: dateStr,
        location: copyNewForm.value.location || null,
      })
      targetId = res.data.id
      await store.loadExhibitions()
    }

    const result = await exhibitionApi.copyTemplate(copySourceEx.value.id, targetId)
    ElMessage.success(result.message || t('exhibitionList.copySuccess'))
    copyDialog.value = false
  } catch (err) {
    ElMessage.error(err.message || t('exhibitionList.copyFailed'))
  } finally {
    copyLoading.value = false
  }
}

async function goChecklist(ex) {
  if (ex.status === 'preparing') {
    await store.updateExhibition(ex.id, { status: 'active' })
  }
  router.push(`/exhibitions/${ex.id}/checklist`)
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

.header-actions { display: flex; align-items: center; gap: 10px; }

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

.ex-card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}
.copy-template-btn { flex-shrink: 0; }
.footer-right { display: flex; gap: 8px; }

/* 复制弹窗样式 */
.copy-dialog-body { display: flex; flex-direction: column; gap: 20px; }
.copy-source-info {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  background: #fdf6ec;
  border-radius: 8px;
  font-size: 14px;
  color: #606266;
}
.copy-mode-tabs { display: flex; justify-content: center; }
.copy-target-select { display: flex; flex-direction: column; gap: 8px; }
.copy-hint { font-size: 12px; color: #909399; margin: 0; }
.copy-new-form { padding: 4px 0; }
</style>
