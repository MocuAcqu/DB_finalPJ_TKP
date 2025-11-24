@main_bp.route('/interest', methods=['POST'])
@login_required
def express_interest():
    data = request.json
    item_id = data.get('item_id')

    item = items.find_one({"_id": ObjectId(item_id)})
    if not item:
        return jsonify({"ok": False, "error": "Item not found"}), 404

    # 建立 transaction
    transactions.insert_one({
        "item_id": item["_id"],
        "owner_id": item["owner_id"],
        "interested_user_id": ObjectId(current_user.id),
        "type": item["listing_type"],
        "status": "pending"
    })

    return jsonify({"ok": True})
