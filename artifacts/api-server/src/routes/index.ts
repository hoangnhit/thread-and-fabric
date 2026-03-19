import { Router, type IRouter } from "express";
import healthRouter from "./health";
import fabricsRouter from "./fabrics";
import proxyRouter from "./proxy";
import ocrRouter from "./ocr";
import chartOffsetsRouter from "./chart-offsets";

const router: IRouter = Router();

router.use(healthRouter);
router.use(fabricsRouter);
router.use(proxyRouter);
router.use(ocrRouter);
router.use(chartOffsetsRouter);

export default router;
