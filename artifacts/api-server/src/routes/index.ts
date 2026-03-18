import { Router, type IRouter } from "express";
import healthRouter from "./health";
import fabricsRouter from "./fabrics";
import proxyRouter from "./proxy";

const router: IRouter = Router();

router.use(healthRouter);
router.use(fabricsRouter);
router.use(proxyRouter);

export default router;
