"""Script de entrenamiento del CNN clasificador Stage 2 (C-UAS).

Soporta:
  - Backbone: DINOv2 small/base o ResNet18 (fallback)
  - LoRA adapters para fine-tuning eficiente
  - MLflow tracking (opcional)
  - Early stopping, CosineAnnealingWarmRestarts LR scheduler
  - Class weights para balanceo
  - Validation: confusion matrix, classification report
  - Export ONNX automático al finalizar

Uso:
  python training/train_classifier.py --data-dir /datasets/drones \\
      --epochs 30 --backbone dinov2_s --lora-r 8 --out models/drone_classifier.onnx
"""
from __future__ import annotations

import argparse
import json
import logging
import sys
import time
from pathlib import Path

log = logging.getLogger("train_classifier")
logging.basicConfig(level=logging.INFO)


def _import_mlflow() -> None:
    """Intenta importar mlflow; si no está, no hace nada."""
    try:
        import mlflow  # noqa: F401
    except ImportError:
        mlflow = None  # type: ignore[assignment]


def _get_class_weights(train_ds) -> list[float] | None:
    """Calcula pesos por clase inversamente proporcionales a frecuencia."""
    try:
        from torch.utils.data import Dataset
    except ImportError:
        return None

    if not hasattr(train_ds, "samples") or not train_ds.samples:
        return None
    labels = [s[1] for s in train_ds.samples]
    from collections import Counter

    counts = Counter(labels)
    n = len(labels)
    weights = [n / max(1, counts.get(i, 1)) for i in range(max(counts.keys()) + 1)]
    # Normalizar
    w_sum = sum(weights)
    if w_sum > 0:
        weights = [w / w_sum * len(weights) for w in weights]
    return weights


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-dir", type=Path, required=True)
    parser.add_argument("--epochs", type=int, default=30)
    parser.add_argument("--batch", type=int, default=32)
    parser.add_argument("--lr", type=float, default=3e-4)
    parser.add_argument("--out", type=Path, default=Path("models/drone_classifier.onnx"))
    parser.add_argument("--backbone", choices=["resnet18", "dinov2_s", "dinov2_b"], default="resnet18")
    parser.add_argument("--lora-r", type=int, default=0, help="LoRA rank (0=no LoRA)")
    parser.add_argument("--mlflow-tracking-uri", type=str, default=None, help="MLflow tracking URI")
    parser.add_argument("--patience", type=int, default=10, help="early stopping patience")
    parser.add_argument("--seed", type=int, default=42, help="random seed")
    args = parser.parse_args()

    try:
        import torch
        import torch.nn as nn
        import torch.optim as optim
        from torch.utils.data import DataLoader
    except ImportError:
        log.error(
            "torch no instalado. Para entrenamiento real: pip install 'edge-llm[torch]'"
        )
        sys.exit(1)

    from training.dataset import DroneDataset
    from training.augmentation import build_train_transforms, build_val_transforms

    torch.manual_seed(args.seed)

    log.info("loading dataset from %s", args.data_dir)
    train_ds = DroneDataset(args.data_dir / "train", build_train_transforms())
    val_ds = DroneDataset(args.data_dir / "val", build_val_transforms())
    train_loader = DataLoader(train_ds, batch_size=args.batch, shuffle=True, num_workers=4)
    val_loader = DataLoader(val_ds, batch_size=args.batch, shuffle=False, num_workers=4)

    num_classes = len(DroneDataset.CLASSES)

    # --- Modelo: DINOv2 o ResNet18 ---
    if args.backbone.startswith("dinov2"):
        from training.dinov2_classifier import DINOv2Classifier

        model = DINOv2Classifier(
            backbone=args.backbone,
            num_classes=num_classes,
            lora_r=args.lora_r,
        )
    else:
        from torchvision.models import resnet18

        model = resnet18(weights=None)
        model.fc = nn.Linear(model.fc.in_features, num_classes)

    device = "cuda" if torch.cuda.is_available() else "cpu"
    model = model.to(device)

    # --- Class weights ---
    class_weights = _get_class_weights(train_ds)
    if class_weights:
        weight_tensor = torch.tensor(class_weights[:num_classes], dtype=torch.float, device=device)
        criterion = nn.CrossEntropyLoss(weight=weight_tensor)
        log.info("class_weights applied: %s", class_weights)
    else:
        criterion = nn.CrossEntropyLoss()

    # --- Optimizer ---
    optimizer = optim.AdamW(
        [p for p in model.parameters() if p.requires_grad],
        lr=args.lr,
        weight_decay=1e-4,
    )

    # --- LR Scheduler ---
    try:
        scheduler = optim.lr_scheduler.CosineAnnealingWarmRestarts(
            optimizer, T_0=5, T_mult=2, eta_min=1e-6
        )
        log.info("scheduler: CosineAnnealingWarmRestarts")
    except Exception:
        scheduler = None

    # --- MLflow ---
    mlflow_run = None
    if args.mlflow_tracking_uri:
        try:
            import mlflow

            mlflow.set_tracking_uri(args.mlflow_tracking_uri)
            mlflow_run = mlflow.start_run()
            mlflow.log_param("backbone", args.backbone)
            mlflow.log_param("epochs", args.epochs)
            mlflow.log_param("batch", args.batch)
            mlflow.log_param("lr", args.lr)
            mlflow.log_param("lora_r", args.lora_r)
            log.info("mlflow_run started uri=%s", args.mlflow_tracking_uri)
        except Exception as exc:
            log.warning("mlflow_init_failed %s", exc)

    best_val_acc = 0.0
    best_state = None
    patience_counter = 0

    # --- Training loop ---
    for epoch in range(args.epochs):
        model.train()
        total = 0
        loss_sum = 0.0
        for imgs, labels in train_loader:
            imgs = imgs.to(device)
            labels = labels.to(device)
            optimizer.zero_grad()
            out = model(imgs)
            loss = criterion(out, labels)
            loss.backward()
            optimizer.step()
            loss_sum += loss.item() * imgs.size(0)
            total += imgs.size(0)

        train_loss = loss_sum / max(1, total)
        log.info("epoch %d  train_loss=%.4f", epoch, train_loss)

        if scheduler is not None:
            scheduler.step()
            current_lr = optimizer.param_groups[0]["lr"]
            log.info("epoch %d  lr=%.6f", epoch, current_lr)

        # --- Validation ---
        model.eval()
        correct = 0
        v_total = 0
        all_preds: list[int] = []
        all_labels: list[int] = []
        val_loss_sum = 0.0

        with torch.no_grad():
            for imgs, labels in val_loader:
                imgs = imgs.to(device)
                labels = labels.to(device)
                out = model(imgs)
                loss = criterion(out, labels)
                pred = out.argmax(dim=1)
                correct += (pred == labels).sum().item()
                v_total += imgs.size(0)
                val_loss_sum += loss.item() * imgs.size(0)
                all_preds.extend(pred.cpu().numpy().tolist())
                all_labels.extend(labels.cpu().numpy().tolist())

        val_acc = correct / max(1, v_total)
        val_loss = val_loss_sum / max(1, v_total)
        log.info("epoch %d  val_loss=%.4f  val_acc=%.3f", epoch, val_loss, val_acc)

        if mlflow_run:
            try:
                import mlflow

                mlflow.log_metric("train_loss", train_loss, step=epoch)
                mlflow.log_metric("val_loss", val_loss, step=epoch)
                mlflow.log_metric("val_accuracy", val_acc, step=epoch)
            except Exception:
                pass

        # --- Early stopping + best model ---
        if val_acc > best_val_acc:
            best_val_acc = val_acc
            best_state = {k: v.detach().cpu().clone() for k, v in model.state_dict().items()}
            patience_counter = 0
            log.info("best_model val_acc=%.4f", val_acc)
        else:
            patience_counter += 1
            if patience_counter >= args.patience:
                log.info("early_stopping at epoch %d (patience=%d)", epoch, args.patience)
                break

    # --- Restore best model ---
    if best_state:
        model.load_state_dict(best_state)
        log.info("best_model_restored val_acc=%.4f", best_val_acc)

    # --- Classification report + confusion matrix ---
    try:
        from sklearn.metrics import classification_report, confusion_matrix

        model.eval()
        all_preds_final: list[int] = []
        all_labels_final: list[int] = []
        with torch.no_grad():
            for imgs, labels in val_loader:
                imgs = imgs.to(device)
                out = model(imgs)
                pred = out.argmax(dim=1)
                all_preds_final.extend(pred.cpu().numpy().tolist())
                all_labels_final.extend(labels.cpu().numpy().tolist())

        cm = confusion_matrix(all_labels_final, all_preds_final)
        cr = classification_report(
            all_labels_final,
            all_preds_final,
            target_names=DroneDataset.CLASSES[:cm.shape[0]],
            zero_division=0,
        )
        log.info("confusion_matrix:\n%s", cm)
        log.info("classification_report:\n%s", cr)
        log.info("best_val_acc=%.4f", best_val_acc)

        if mlflow_run:
            try:
                import mlflow

                mlflow.log_text(str(cm), "confusion_matrix.txt")
                mlflow.log_text(str(cr), "classification_report.txt")
                mlflow.log_metric("best_val_accuracy", best_val_acc)
            except Exception:
                pass
    except ImportError:
        log.info("sklearn not available — skipping classification report")

    # --- Export ONNX ---
    args.out.parent.mkdir(parents=True, exist_ok=True)
    dummy = torch.randn(1, 3, 224, 224, device=device)
    try:
        torch.onnx.export(
            model,
            dummy,
            str(args.out),
            input_names=["input"],
            output_names=["logits"],
            opset_version=17,
            dynamic_axes={"input": {0: "batch"}, "logits": {0: "batch"}},
        )
        log.info("onnx_exported path=%s", args.out)
    except Exception as exc:
        log.warning("onnx_export_failed %s", exc)

    # --- Save LoRA weights if applicable ---
    if args.lora_r > 0 and args.backbone.startswith("dinov2"):
        try:
            from training.lora import lora_state_dict

            lora_path = args.out.with_suffix(".lora.pt")
            torch.save(lora_state_dict(model), str(lora_path))
            log.info("lora_weights_saved path=%s", lora_path)
        except Exception as exc:
            log.warning("lora_save_failed %s", exc)

    if mlflow_run:
        try:
            import mlflow

            mlflow.log_artifact(str(args.out))
            if args.lora_r > 0:
                mlflow.log_artifact(str(args.out.with_suffix(".lora.pt")))
            mlflow.end_run()
        except Exception:
            pass

    log.info("training_complete best_val_acc=%.4f output=%s", best_val_acc, args.out)


if __name__ == "__main__":
    main()
