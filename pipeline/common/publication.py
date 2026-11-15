"""Local publication transactions: prepare first, manifest last, restore on failure."""
import os
import shutil
from contextlib import contextmanager
from pathlib import Path
from tempfile import NamedTemporaryFile, TemporaryDirectory


@contextmanager
def proposal(destination):
    destination = Path(destination).resolve()
    destination.parent.mkdir(parents=True, exist_ok=True)
    with TemporaryDirectory(dir=destination.parent, prefix=".publication-") as temporary:
        stage = Path(temporary) / "data"
        if destination.is_dir():
            shutil.copytree(destination, stage)
        else:
            stage.mkdir()
        yield stage


def publish(staged):
    """Map destination paths to prepared source paths. No partial publication survives an exception."""
    prepared, backups, installed = {}, {}, []

    def temporary_for(destination):
        with NamedTemporaryFile(dir=destination.parent, prefix=".publication-", delete=False) as handle:
            return Path(handle.name)

    try:
        for destination, source in sorted(staged.items(), key=lambda pair: (pair[0].name == "manifest.json",
                                                                           str(pair[0]))):
            destination.parent.mkdir(parents=True, exist_ok=True)
            prepared[destination] = temporary_for(destination) if source is not None else None
            if source is not None:
                shutil.copyfile(source, prepared[destination])
            if destination.is_file():
                backups[destination] = temporary_for(destination)
                shutil.copyfile(destination, backups[destination])
        for destination, source in prepared.items():
            if source is None:
                destination.unlink(missing_ok=True)
            else:
                os.replace(source, destination)
            installed.append(destination)
    except BaseException:
        for destination in reversed(installed):
            if destination in backups:
                shutil.copyfile(backups[destination], destination)
            else:
                destination.unlink(missing_ok=True)
        raise
    finally:
        for temporary in (*prepared.values(), *backups.values()):
            if temporary is not None:
                temporary.unlink(missing_ok=True)


def publish_tree(stage, destination):
    stage, destination = Path(stage).resolve(), Path(destination).resolve()
    proposed = {destination / file.relative_to(stage): file for file in stage.rglob("*") if file.is_file()}
    for file in destination.rglob("*"):
        if file.is_file() and file not in proposed:
            proposed[file] = None
    publish(proposed)
