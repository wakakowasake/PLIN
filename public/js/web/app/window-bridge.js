export function bindMainWindowBridge({
    Modals,
    Profile,
    Header,
    ExpenseDetail,
    closeTripInfoModal,
    saveTripInfo,
    resetHeroImage,
    deleteHeroImage,
    openRouteModal,
    closeRouteModal,
    editCurrentItem,
    deleteCurrentItem,
    openCopyItemModal,
    closeCopyItemModal,
    copyItemToCurrent,
    handleAttachmentUpload,
    renderExpenseList,
    deleteAttachment,
    openAttachment,
    closeAttachmentLightbox,
    autoSave
}) {
    window.openGeneralDeleteModal = Modals.openGeneralDeleteModal;
    window.closeGeneralDeleteModal = Modals.closeGeneralDeleteModal;
    window.confirmGeneralDelete = Modals.confirmGeneralDelete;

    window.closeUserSettings = Profile.closeUserSettings;
    window.toggleDarkMode = Profile.toggleDarkMode;
    window.closeProfileView = Profile.closeProfileView;
    window.handleProfilePhotoChange = Profile.handleProfilePhotoChange;
    window.saveProfileChanges = Profile.saveProfileChanges;

    window.openTripInfoModal = Header.openTripInfoModal;
    window.closeTripInfoModal = closeTripInfoModal;
    window.saveTripInfo = saveTripInfo;
    window.resetHeroImage = resetHeroImage;
    window.deleteHeroImage = deleteHeroImage;

    window.openRouteModal = openRouteModal;
    window.closeRouteModal = closeRouteModal;

    window.closeMemoModal = Modals.closeMemoModal;
    window.editCurrentMemo = Modals.editCurrentMemo;
    window.editCurrentItem = editCurrentItem;
    window.deleteCurrentItem = deleteCurrentItem;
    window.saveCurrentMemo = Modals.saveCurrentMemo;

    window.openCopyItemModal = openCopyItemModal;
    window.closeCopyItemModal = closeCopyItemModal;
    window.copyItemToCurrent = copyItemToCurrent;
    window.handleAttachmentUpload = handleAttachmentUpload;

    window.renderExpenseList = renderExpenseList;
    window.deleteAttachment = deleteAttachment;
    window.openAttachment = openAttachment;
    window.closeAttachmentLightbox = closeAttachmentLightbox;

    window.openLightbox = Modals.openLightbox;
    window.closeLightbox = Modals.closeLightbox;
    window.autoSave = autoSave;

    window.closeExpenseDetailModal = ExpenseDetail.closeExpenseDetailModal;
    window.calculateSplit = ExpenseDetail.calculateSplit;
    window.deleteExpenseFromDetail = ExpenseDetail.deleteExpenseFromDetail;
}
