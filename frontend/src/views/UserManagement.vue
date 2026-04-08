<template>
  <div>
    <!-- 页面标题 -->
    <div class="page-header">
      <div>
        <h2>{{ t('userMgmt.pageTitle') }}</h2>
        <p class="page-desc">{{ t('userMgmt.pageDesc') }}</p>
      </div>
      <el-button type="primary" @click="openCreateDialog">
        <el-icon><Plus /></el-icon> {{ t('userMgmt.createBtn') }}
      </el-button>
    </div>

    <!-- 用户列表 -->
    <el-card>
      <el-table :data="users" v-loading="loading" stripe style="width: 100%" table-layout="fixed">
        <el-table-column prop="id" :label="t('userMgmt.colId')" :width="idColWidth" align="center" />
        <el-table-column prop="username" :label="t('userMgmt.colUsername')" align="center" />
        <el-table-column prop="role" :label="t('userMgmt.colRole')" :width="roleColWidth" align="center">
          <template #default="{ row }">
            <el-tag :type="roleTagType(row.role)" size="small">
              {{ t(`userMgmt.roles.${row.role}`) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="created_at" :label="t('userMgmt.colCreatedAt')" :width="dateColWidth" align="center">
          <template #default="{ row }">{{ formatDate(row.created_at) }}</template>
        </el-table-column>
        <el-table-column :label="t('userMgmt.colActions')" :width="actionsColWidth" align="center">
          <template #default="{ row }">
            <div class="action-btns">
              <el-button size="small" @click="openEditRole(row)">{{ t('userMgmt.changeRole') }}</el-button>
              <el-button size="small" @click="openResetPassword(row)">{{ t('userMgmt.resetPwd') }}</el-button>
              <el-button size="small" type="info" @click="openViewPassword(row)">
                <el-icon><View /></el-icon> {{ t('userMgmt.viewPwd') }}
              </el-button>
              <el-button
                size="small"
                type="danger"
                :disabled="row.id === authStore.user?.id"
                @click="handleDelete(row)"
              >{{ t('userMgmt.deleteUser') }}</el-button>
            </div>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 创建账号对话框 -->
    <el-dialog v-model="createDialogVisible" :title="t('userMgmt.createTitle')" width="420px">
      <el-form ref="createFormRef" :model="createForm" :rules="createRules" label-position="top">
        <el-form-item :label="t('userMgmt.fieldUsername')" prop="username">
          <el-input v-model="createForm.username" :placeholder="t('userMgmt.usernamePlaceholder')" />
        </el-form-item>
        <el-form-item :label="t('userMgmt.fieldPassword')" prop="password">
          <el-input v-model="createForm.password" type="password" show-password :placeholder="t('userMgmt.passwordPlaceholder')" />
        </el-form-item>
        <el-form-item :label="t('userMgmt.fieldRole')" prop="role">
          <el-select v-model="createForm.role" style="width: 100%">
            <el-option value="admin" :label="t('userMgmt.roles.admin')" />
            <el-option value="staff" :label="t('userMgmt.roles.staff')" />
            <el-option value="guest" :label="t('userMgmt.roles.guest')" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createDialogVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="submitting" @click="handleCreate">{{ t('common.confirm') }}</el-button>
      </template>
    </el-dialog>

    <!-- 修改角色对话框 -->
    <el-dialog v-model="editRoleDialogVisible" :title="t('userMgmt.editRoleTitle')" width="380px">
      <el-form label-position="top">
        <el-form-item :label="t('userMgmt.fieldRole')">
          <el-select v-model="editRoleForm.role" style="width: 100%">
            <el-option value="admin" :label="t('userMgmt.roles.admin')" />
            <el-option value="staff" :label="t('userMgmt.roles.staff')" />
            <el-option value="guest" :label="t('userMgmt.roles.guest')" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editRoleDialogVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="submitting" @click="handleEditRole">{{ t('common.confirm') }}</el-button>
      </template>
    </el-dialog>

    <!-- 重置密码对话框 -->
    <el-dialog v-model="resetPwdDialogVisible" :title="t('userMgmt.resetPwdTitle')" width="380px">
      <el-form ref="resetPwdFormRef" :model="resetPwdForm" :rules="resetPwdRules" label-position="top">
        <el-form-item :label="t('userMgmt.fieldNewPwd')" prop="password">
          <el-input v-model="resetPwdForm.password" type="password" show-password :placeholder="t('userMgmt.newPwdPlaceholder')" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="resetPwdDialogVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="submitting" @click="handleResetPassword">{{ t('common.confirm') }}</el-button>
      </template>
    </el-dialog>

    <!-- 查看密码对话框 -->
    <el-dialog v-model="viewPwdDialogVisible" :title="t('userMgmt.viewPwdTitle')" width="380px">
      <div class="view-pwd-content">
        <div v-if="viewPwdLoading" class="pwd-loading">
          <el-icon class="is-loading"><Loading /></el-icon>
          {{ t('userMgmt.viewPwdLoading') }}
        </div>
        <template v-else>
          <div class="pwd-user-info">
            <el-avatar :size="36" style="background: #0f3460; color: #fff; font-size: 15px; flex-shrink: 0">
              {{ viewPwdUser?.username?.charAt(0)?.toUpperCase() }}
            </el-avatar>
            <div>
              <div class="pwd-username">{{ viewPwdUser?.username }}</div>
              <el-tag :type="roleTagType(viewPwdUser?.role)" size="small">
                {{ t(`userMgmt.roles.${viewPwdUser?.role}`) }}
              </el-tag>
            </div>
          </div>
          <el-divider />
          <div v-if="viewPwdValue === null" class="pwd-old-account">
            <el-icon color="#e6a23c"><Warning /></el-icon>
            {{ t('userMgmt.viewPwdOldAccount') }}
          </div>
          <div v-else class="pwd-display-row">
            <span class="pwd-label">{{ t('userMgmt.viewPwdCurrent') }}</span>
            <div class="pwd-value-wrap">
              <span class="pwd-value" :class="{ 'pwd-hidden': !showPwd }">
                {{ showPwd ? viewPwdValue : '••••••••' }}
              </span>
              <el-button
                text
                size="small"
                @click="showPwd = !showPwd"
                style="margin-left: 8px"
              >
                <el-icon><component :is="showPwd ? Hide : View" /></el-icon>
              </el-button>
              <el-button
                text
                size="small"
                @click="copyPassword"
                style="margin-left: 4px"
              >
                <el-icon><CopyDocument /></el-icon>
              </el-button>
            </div>
          </div>
        </template>
      </div>
      <template #footer>
        <el-button @click="viewPwdDialogVisible = false">{{ t('common.cancel') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, View, Hide, CopyDocument, Loading, Warning } from '@element-plus/icons-vue'
import axios from 'axios'
import { useAuthStore } from '@/stores/auth'

const { t } = useI18n()
const authStore = useAuthStore()

const users = ref([])
const loading = ref(false)
const submitting = ref(false)

// 创建账号
const createDialogVisible = ref(false)
const createFormRef = ref(null)
const createForm = ref({ username: '', password: '', role: 'staff' })
const createRules = {
  username: [{ required: true, message: t('userMgmt.usernameRequired'), trigger: 'blur' }],
  password: [{ required: true, min: 4, message: t('userMgmt.passwordMinLength'), trigger: 'blur' }],
  role: [{ required: true, message: t('userMgmt.roleRequired'), trigger: 'change' }],
}

// 修改角色
const editRoleDialogVisible = ref(false)
const editRoleForm = ref({ id: null, role: 'staff' })

// 重置密码
const resetPwdDialogVisible = ref(false)
const resetPwdFormRef = ref(null)
const resetPwdForm = ref({ id: null, password: '' })
const resetPwdRules = {
  password: [{ required: true, min: 4, message: t('userMgmt.passwordMinLength'), trigger: 'blur' }],
}

// 查看密码
const viewPwdDialogVisible = ref(false)
const viewPwdLoading = ref(false)
const viewPwdUser = ref(null)
const viewPwdValue = ref(null)
const showPwd = ref(false)

async function loadUsers() {
  loading.value = true
  try {
    const res = await axios.get('/api/users', { withCredentials: true })
    users.value = res.data.data
  } catch (err) {
    ElMessage.error(t('userMgmt.loadFailed'))
  } finally {
    loading.value = false
  }
}

function openCreateDialog() {
  createForm.value = { username: '', password: '', role: 'staff' }
  createDialogVisible.value = true
}

async function handleCreate() {
  const valid = await createFormRef.value?.validate().catch(() => false)
  if (!valid) return
  submitting.value = true
  try {
    await axios.post('/api/users', createForm.value, { withCredentials: true })
    ElMessage.success(t('userMgmt.createSuccess'))
    createDialogVisible.value = false
    loadUsers()
  } catch (err) {
    ElMessage.error(err.response?.data?.message || t('common.save') + '失败')
  } finally {
    submitting.value = false
  }
}

function openEditRole(row) {
  editRoleForm.value = { id: row.id, role: row.role }
  editRoleDialogVisible.value = true
}

async function handleEditRole() {
  submitting.value = true
  try {
    await axios.patch(`/api/users/${editRoleForm.value.id}/role`, { role: editRoleForm.value.role }, { withCredentials: true })
    ElMessage.success(t('userMgmt.roleUpdated'))
    editRoleDialogVisible.value = false
    loadUsers()
  } catch (err) {
    ElMessage.error(err.response?.data?.message || '修改失败')
  } finally {
    submitting.value = false
  }
}

function openResetPassword(row) {
  resetPwdForm.value = { id: row.id, password: '' }
  resetPwdDialogVisible.value = true
}

async function handleResetPassword() {
  const valid = await resetPwdFormRef.value?.validate().catch(() => false)
  if (!valid) return
  submitting.value = true
  try {
    await axios.patch(`/api/users/${resetPwdForm.value.id}/password`, { password: resetPwdForm.value.password }, { withCredentials: true })
    ElMessage.success(t('userMgmt.pwdReset'))
    resetPwdDialogVisible.value = false
  } catch (err) {
    ElMessage.error(err.response?.data?.message || '修改失败')
  } finally {
    submitting.value = false
  }
}

async function openViewPassword(row) {
  viewPwdUser.value = row
  viewPwdValue.value = null
  showPwd.value = false
  viewPwdLoading.value = true
  viewPwdDialogVisible.value = true
  try {
    const res = await axios.get(`/api/users/${row.id}/password`, { withCredentials: true })
    viewPwdValue.value = res.data.password
  } catch (err) {
    ElMessage.error(err.response?.data?.message || '获取密码失败')
    viewPwdDialogVisible.value = false
  } finally {
    viewPwdLoading.value = false
  }
}

function copyPassword() {
  if (!viewPwdValue.value) return
  navigator.clipboard.writeText(viewPwdValue.value).then(() => {
    ElMessage.success('密码已复制到剪贴板')
  }).catch(() => {
    ElMessage.warning('复制失败，请手动复制')
  })
}

async function handleDelete(row) {
  try {
    await ElMessageBox.confirm(
      t('userMgmt.deleteConfirmMsg', { username: row.username }),
      t('userMgmt.deleteConfirmTitle'),
      { type: 'warning', confirmButtonText: t('common.confirm'), cancelButtonText: t('common.cancel') }
    )
    await axios.delete(`/api/users/${row.id}`, { withCredentials: true })
    ElMessage.success(t('userMgmt.deleteSuccess'))
    loadUsers()
  } catch (err) {
    if (err !== 'cancel') {
      ElMessage.error(err.response?.data?.message || '删除失败')
    }
  }
}

function roleTagType(role) {
  return { admin: 'danger', staff: 'primary', guest: 'info' }[role] || 'info'
}

function formatDate(dt) {
  return dt ? dt.replace('T', ' ').slice(0, 16) : '-'
}

onMounted(loadUsers)

// 按 2:2:1:2:4 比例动态计算列宽（总份数 11）
const totalWidth = computed(() => window.innerWidth > 1200 ? 1100 : window.innerWidth - 80)
const idColWidth = computed(() => Math.floor(totalWidth.value * 2 / 11))
const roleColWidth = computed(() => Math.floor(totalWidth.value * 1 / 11))
const dateColWidth = computed(() => Math.floor(totalWidth.value * 2 / 11))
const actionsColWidth = computed(() => Math.floor(totalWidth.value * 4 / 11))
</script>

<style scoped>
.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 20px;
}
.page-header h2 {
  font-size: 22px;
  font-weight: 700;
  color: #1a1a2e;
}
.page-desc {
  font-size: 14px;
  color: #909399;
  margin-top: 4px;
}
.action-btns {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: center;
  align-items: center;
}

/* 查看密码对话框样式 */
.view-pwd-content {
  padding: 8px 0;
}
.pwd-loading {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #909399;
  justify-content: center;
  padding: 20px 0;
}
.pwd-user-info {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 4px;
}
.pwd-username {
  font-size: 15px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 4px;
}
.pwd-old-account {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #e6a23c;
  font-size: 14px;
  background: #fdf6ec;
  padding: 12px 16px;
  border-radius: 8px;
}
.pwd-display-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #f5f7fa;
  border-radius: 8px;
  padding: 12px 16px;
}
.pwd-label {
  font-size: 13px;
  color: #606266;
  font-weight: 500;
}
.pwd-value-wrap {
  display: flex;
  align-items: center;
}
.pwd-value {
  font-family: 'Courier New', monospace;
  font-size: 16px;
  font-weight: 700;
  color: #1a1a2e;
  letter-spacing: 1px;
}
.pwd-hidden {
  letter-spacing: 3px;
  font-size: 18px;
}
</style>
