# -*- coding: utf-8 -*-
"""Thay scipy.ndimage cho 4 ham chargen.cutout dung: label, binary_opening, binary_dilation, gaussian_filter.
Co scipy thi dung scipy; khong co thi dung OpenCV (neu may co opencv-python). Ket qua tuong duong; nho vay scipy (nang) khong con bat buoc."""
import numpy as np

try:
    from scipy import ndimage as _sp
except Exception:                                  # noqa
    _sp = None

FORCE_CV2 = False                                  # chi de kiem thu: ep dung nhanh OpenCV


def _use_sp():
    return _sp is not None and not FORCE_CV2


def _cross():
    import cv2
    return cv2.getStructuringElement(cv2.MORPH_CROSS, (3, 3))


def label(mask):
    """-> (nhan int32 0..n, n); lien thong 4 huong nhu scipy."""
    if _use_sp():
        return _sp.label(mask)
    import cv2
    n, lab = cv2.connectedComponents(np.ascontiguousarray(mask, dtype=np.uint8), connectivity=4)
    return lab.astype(np.int32), int(n) - 1


def binary_opening(mask, iterations=1):
    if _use_sp():
        return _sp.binary_opening(mask, iterations=iterations)
    import cv2
    m, k = np.ascontiguousarray(mask, dtype=np.uint8), _cross()
    m = cv2.erode(m, k, iterations=iterations, borderType=cv2.BORDER_CONSTANT, borderValue=0)      # ngoai anh = 0 nhu scipy
    m = cv2.dilate(m, k, iterations=iterations, borderType=cv2.BORDER_CONSTANT, borderValue=0)
    return m.astype(bool)


def binary_dilation(mask, iterations=1):
    if _use_sp():
        return _sp.binary_dilation(mask, iterations=iterations)
    import cv2
    return cv2.dilate(np.ascontiguousarray(mask, dtype=np.uint8), _cross(), iterations=iterations, borderType=cv2.BORDER_CONSTANT, borderValue=0).astype(bool)


def gaussian_filter(a, sigma):
    if _use_sp():
        return _sp.gaussian_filter(a, sigma)
    import cv2
    r = int(4.0 * float(sigma) + 0.5)               # cung ban kinh nhan (truncate=4) voi scipy
    return cv2.GaussianBlur(np.ascontiguousarray(a, dtype=np.float64), (2 * r + 1, 2 * r + 1), float(sigma), borderType=cv2.BORDER_REFLECT)


def distance_transform_edt(mask, return_indices=False):
    """mask: True = diem can tinh khoang cach toi diem False GAN NHAT. -> dist (float) hoac (dist, (iy, ix)) = toa do diem False gan nhat (giong scipy)."""
    if _use_sp():
        if return_indices:
            d, ind = _sp.distance_transform_edt(mask, return_indices=True)
            return d, (ind[0], ind[1])
        return _sp.distance_transform_edt(mask)
    import cv2
    src = np.ascontiguousarray(mask, dtype=np.uint8)
    if not return_indices:
        return cv2.distanceTransform(src, cv2.DIST_L2, 5)
    d, lab = cv2.distanceTransformWithLabels(src, cv2.DIST_L2, 5, labelType=cv2.DIST_LABEL_PIXEL)
    zy, zx = np.nonzero(src == 0)
    if len(zy) == 0:                                  # khong co diem False nao: khong co "gan nhat"
        z = np.zeros(src.shape, np.int64)
        return d, (z, z.copy())
    ly = np.zeros(int(lab.max()) + 1, np.int64)
    lx = np.zeros_like(ly)
    ly[lab[zy, zx]] = zy
    lx[lab[zy, zx]] = zx
    return d, (ly[lab], lx[lab])
