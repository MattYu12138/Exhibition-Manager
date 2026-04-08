<template>
  <div>
    <!-- 页面标题 -->
    <div class="page-header">
      <div>
        <h2>{{ t('userMgmt.pageTitle') }}</h2>
        <p class="page-desc">{{ t('userMgmt.pageDesc') }}</p>
      </div>
      <el-button type="primary" @click="openCreateDialog">
        <el-icon><Plus /></el-icon> {{ t('userMgmt.createUser') }}
      </el-button>
    </div>

    <!-- 用户列表 -->
    <el-card>
      <el-table :data="users" v-loading="loading" stripe>
        <el-table-column prop="id" label="ID" width="60" />
        <el-table-column prop="username" :label="t('userMgmt.username')" />
        <el-table-column prop="role" :label="t('userMgmt.role')" width="120">
          <template #default="{ row }">
            <el-tag :type="roleTagType(row.role)" size="small">
              {{ t(`userMgmt.roles.${row.role}`) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="created_at" :label="t('userMgmt.createdAt')" width="180">
          <template #default="{ row }">{{ formatDate(row.created_at) }}</template>
        </el-table-column>
        <el-table-column :label="t('common.edit')" width="200" align="right">
          <template #default="{ row }">
            <el-button size="small" @click="openEditRole(row)">{{ t('userMgmt.changeRole') }}</el-button>
            <el-button size="small" @click="openResetPassword(row)">{{ t('userMgmt.resetPassword') }}</el-button>
            <el-button
              size="small"
              type="danger"
              :disabled="row.id === authStore.user?.id"
              @click="handleDelete(row)"
            >{{ t('common.delete') }}</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 创建用户对话框 -->
    <el-dialog v-model="createDialogVisible" :title="t('userMgmt.createUser')" width="400px">
      <el-form ref="createFormRef" :model="createForm" :rules="createRules" label-position="top">
        <el-form-item :label="t('userMgmt.username')" prop="username">
          <el-input v-model="createForm.username" />
        </el-form-item>
        <el-form-item :label="t('login.password')" prop="password">
          <el-input v-model="createForm.password" type="password" show-password />
        </el-form-item>
        <el-form-item :label="t('userMgmt.role')" prop="role">
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
    <el-dialog v-model="editRoleDialogVisible" :title="t('userMgmt.changeRole')" width="360px">
      <el-form label-position="top">
        <el-form-item :label="t('userMgmt.role')">
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
    <el-dialog v-model="resetPwdDialogVisible" :title="t('userMgmt.resetPassword')" width="360px">
      <el-form ref="resetPwdFormRef" :model="resetPwdForm" :rules="resetPwdRules" label-position="top">
        <el-form-item :label="t('userMgmt.newPassword')" prop="password">
          <el-input v-model="resetPwdForm.password" type="password" show-password />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="resetPwdDialogVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="submitting" @click="handleResetPassword">{{ t('common.confirm') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import axios from 'axios'
import { useAuthStore } from '@/stores/auth'

const { t } = useI18n()
const authStore = useAuthStore()

const users = ref([])
const loading = ref(false)
const submitting = ref(false)

// 创建用户
const createDialogVisible = ref(false)
const createFormRef = ref(null)
const createForm = ref({ username: '', password: '', role: 'staff' })
const createRules = {
  username: [{ required: true, message: t('userMgmt.usernameRequired'), trigger: 'blur' }],
  password: [{ required: true, min: 4, message: t('userMgmt.passwordMin'), trigger: 'blur' }],
  role: [{ required: true, trigger: 'change' }],
}

// 修改角色
const editRoleDialogVisible = ref(false)
const editRoleForm = ref({ id: null, role: 'staff' })

// 重置密码
const resetPwdDialogVisible = ref(false)
const resetPwdFormRef = ref(null)
const resetPwdForm = ref({ id: null, password: '' })
const resetPwdRules = {
  password: [{ required: true, min: 4, message: t('userMgmt.passwordMin'), trigger: 'blur' }],
}

async function loadUsers() {
  loading.value = true
  try {
    const res = await axios.get('/api/users', { withCredentials: true })
    users.value = res.data.data
  } catch (err) {
    ElMessage.error(err.response?.data?.message || '加载失败')
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
    ElMessage.error(err.response?.data?.message || '创建失败')
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
    ElMessage.success(t('userMgmt.updateSuccess'))
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
    ElMessage.success(t('userMgmt.updateSuccess'))
    resetPwdDialogVisible.value = false
  } catch (err) {
    ElMessage.error(err.response?.data?.message || '修改失败')
  } finally {
    submitting.value = false
  }
}

async function handleDelete(row) {
  await ElMessageBox.confirm(
    t('userMgmt.deleteConfirm', { name: row.username }),
    t('common.confirm'),
    { type: 'warning' }
  )
  try {
    await axios.delete(`/api/users/${row.id}`, { withCredentials: true })
    ElMessage.success(t('userMgmt.deleteSuccess'))
    loadUsers()
  } catch (err) {
    ElMessage.error(err.response?.data?.message || '删除失败')
  }
}

function roleTagType(role) {
  return { admin: 'danger', staff: 'primary', guest: 'info' }[role] || 'info'
}

function formatDate(dt) {
  return dt ? dt.replace('T', ' ').slice(0, 16) : '-'
}

onMounted(loadUsers)
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
</style>
