(function (global) {
  'use strict';

  const OPERATORS = [
    { id: 'starter', name: 'Starter', desc: 'Conceives and designs work', seq: 1, tier: 'genesis' },
    { id: 'doer', name: 'Doer', desc: 'Builds and produces artifacts', seq: 2, tier: 'genesis' },
    { id: 'compiler', name: 'Compiler', desc: 'Packages work into coherent form', seq: 3, tier: 'genesis' },
    { id: 'reviewer', name: 'Reviewer', desc: 'Tests and evaluates quality', seq: 4, tier: 'evaluation' },
    { id: 'approver', name: 'Approver', desc: 'Authorizes and validates', seq: 5, tier: 'evaluation' },
    { id: 'documenter', name: 'Documenter', desc: 'Records and formalizes', seq: 6, tier: 'evaluation' },
    { id: 'integrator', name: 'Integrator', desc: 'Synthesizes into coherent wholes', seq: 7, tier: 'continuity' },
    { id: 'maintainer', name: 'Maintainer', desc: 'Preserves and sustains systems', seq: 8, tier: 'continuity' },
    { id: 'evolver', name: 'Evolver', desc: 'Transforms and reinitiates cycles', seq: 9, tier: 'continuity' }
  ];

  const OPERATOR_INDEX = OPERATORS.reduce((acc, operator) => {
    acc[operator.id] = operator;
    return acc;
  }, {});

  function normalizeRole(role) {
    if (!role || typeof role !== 'object') return null;

    const {
      id,
      name,
      userIds = [],
      parentRoleId = null,
      childRoleIds = []
    } = role;

    if (!id) {
      throw new Error('Role requires an id');
    }

    return {
      id,
      name: name || id,
      userIds: Array.from(new Set(userIds)),
      parentRoleId,
      childRoleIds: Array.from(new Set(childRoleIds))
    };
  }

  function normalizeRoles(roles) {
    if (!roles) return {};
    const map = {};
    const list = Array.isArray(roles) ? roles : Object.values(roles);
    list.forEach((role) => {
      const normalized = normalizeRole(role);
      if (normalized) {
        map[normalized.id] = normalized;
      }
    });
    return map;
  }

  function createDefaultStageConfig() {
    return OPERATORS.map((operator) => ({
      stageKey: operator.id,
      active: false,
      assignedRoleIds: [],
      assignedUserIds: [],
      optedOutUserIds: []
    }));
  }

  function ensureStageConfig(flow) {
    if (!flow) return createDefaultStageConfig();
    if (Array.isArray(flow.stageConfig) && flow.stageConfig.length) {
      const existingKeys = new Set(flow.stageConfig.map((cfg) => cfg.stageKey));
      const merged = flow.stageConfig.map((cfg) => ({
        stageKey: cfg.stageKey,
        active: Boolean(cfg.active),
        assignedRoleIds: Array.from(new Set(cfg.assignedRoleIds || [])),
        assignedUserIds: Array.from(new Set(cfg.assignedUserIds || [])),
        optedOutUserIds: Array.from(new Set(cfg.optedOutUserIds || []))
      }));

      OPERATORS.forEach((operator) => {
        if (!existingKeys.has(operator.id)) {
          merged.push({
            stageKey: operator.id,
            active: false,
            assignedRoleIds: [],
            assignedUserIds: [],
            optedOutUserIds: []
          });
        }
      });

      return merged.sort((a, b) => {
        const seqA = OPERATOR_INDEX[a.stageKey]?.seq || 0;
        const seqB = OPERATOR_INDEX[b.stageKey]?.seq || 0;
        return seqA - seqB;
      });
    }

    return createDefaultStageConfig();
  }

  function collectUsersForRole(roleId, roles, includeNested, visited) {
    if (!roleId || !roles) return [];
    const role = roles[roleId];
    if (!role || visited.has(roleId)) return [];

    visited.add(roleId);
    const users = new Set(role.userIds || []);

    if (includeNested) {
      const childRoleIds = role.childRoleIds || [];
      childRoleIds.forEach((childId) => {
        collectUsersForRole(childId, roles, true, visited).forEach((userId) => users.add(userId));
      });
    }

    return Array.from(users);
  }

  function isUserInRole(user, roleId, roles, includeNested = true, visited) {
    if (!user || !roleId) return false;
    const roleMap = normalizeRoles(roles);
    const userId = typeof user === 'string' ? user : user.id;
    if (!userId) return false;
    const seen = visited || new Set();
    const role = roleMap[roleId];
    if (!role || seen.has(roleId)) return false;

    if (role.userIds?.includes(userId)) {
      return true;
    }

    if (!includeNested) {
      return false;
    }

    seen.add(roleId);
    return (role.childRoleIds || []).some((childId) => isUserInRole(userId, childId, roleMap, true, seen));
  }

  function getUsersForStage(stageConfig, roles, includeNested = true) {
    if (!stageConfig) return [];
    const roleMap = normalizeRoles(roles);
    const users = new Set(stageConfig.assignedUserIds || []);

    (stageConfig.assignedRoleIds || []).forEach((roleId) => {
      collectUsersForRole(roleId, roleMap, includeNested, new Set()).forEach((userId) => users.add(userId));
    });

    (stageConfig.optedOutUserIds || []).forEach((optOutId) => users.delete(optOutId));

    return Array.from(users);
  }

  function getStageConfig(flow, stageKey) {
    if (!flow) return null;
    return ensureStageConfig(flow).find((cfg) => cfg.stageKey === stageKey) || null;
  }

  function findFirstActiveStage(flow) {
    const stageConfig = ensureStageConfig(flow);
    return stageConfig.find((cfg) => cfg.active) || null;
  }

  function getNextActiveStage(flow, currentStageKey) {
    const stageConfig = ensureStageConfig(flow);
    const currentIndex = stageConfig.findIndex((cfg) => cfg.stageKey === currentStageKey);
    if (currentIndex === -1) {
      return findFirstActiveStage(flow);
    }

    for (let i = currentIndex + 1; i < stageConfig.length; i += 1) {
      if (stageConfig[i].active) {
        return stageConfig[i];
      }
    }

    return null;
  }

  function canUserClaimActivity(user, activity, flow, roles) {
    if (!user || !activity || !flow) return false;
    const stageConfig = getStageConfig(flow, activity.currentStageId);
    if (!stageConfig || !stageConfig.active) return false;

    const userId = typeof user === 'string' ? user : user.id;
    if (!userId) return false;

    if (stageConfig.optedOutUserIds?.includes(userId)) {
      return false;
    }

    if (stageConfig.assignedUserIds?.includes(userId)) {
      return true;
    }

    return (stageConfig.assignedRoleIds || []).some((roleId) => isUserInRole(userId, roleId, roles, true));
  }

  function migrateRolesToStageConfig(flow, roles) {
    const stageConfig = ensureStageConfig(flow);
    const roleList = Array.isArray(roles) ? roles : Object.values(roles || {});

    const legacyAssignments = stageConfig.reduce((acc, cfg) => {
      acc[cfg.stageKey] = cfg;
      return acc;
    }, {});

    roleList.forEach((role) => {
      const stageKey = role.operatorType;
      if (!stageKey || !legacyAssignments[stageKey]) {
        return;
      }

      legacyAssignments[stageKey].active = true;
      legacyAssignments[stageKey].assignedRoleIds = Array.from(new Set([
        ...(legacyAssignments[stageKey].assignedRoleIds || []),
        role.id
      ]));
    });

    return ensureStageConfig({ stageConfig: Object.values(legacyAssignments) });
  }

  const EOStageFlow = {
    OPERATORS,
    ensureStageConfig,
    createDefaultStageConfig,
    findFirstActiveStage,
    getNextActiveStage,
    getStageConfig,
    getUsersForStage,
    isUserInRole,
    canUserClaimActivity,
    migrateRolesToStageConfig,
    normalizeRole,
    normalizeRoles
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = EOStageFlow;
  }

  global.EOStageFlow = EOStageFlow;
})(typeof window !== 'undefined' ? window : globalThis);
